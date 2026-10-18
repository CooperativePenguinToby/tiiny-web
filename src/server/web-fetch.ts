import { lookup } from "node:dns";
import { isIP, type LookupFunction } from "node:net";

import { Agent, fetch } from "undici";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 12_000;

// Loopback, private, link-local, carrier-grade NAT and other non-public ranges.
function isPrivate(address: string): boolean {
	if (isIP(address) === 6) {
		const lower = address.toLowerCase();
		if (lower === "::1" || lower === "::") return true;
		if (lower.startsWith("::ffff:")) return isPrivate(lower.slice(7));
		return /^(fc|fd|fe8|fe9|fea|feb)/.test(lower);
	}
	const [a, b] = address.split(".").map(Number);
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		a >= 224
	);
}

// Resolves names for page fetches and refuses any non-public address, at connection time, so neither a
// redirect nor a name that changes its address can reach this server's network or the device.
const publicLookup: LookupFunction = (hostname, options, callback) => {
	lookup(hostname, { ...options, all: true }, (error, addresses) => {
		if (error) {
			callback(error, "", 0);
			return;
		}
		const list = addresses as unknown as { address: string; family: number }[];
		if (list.length === 0 || list.some((entry) => isPrivate(entry.address))) {
			callback(new Error("That address is not on the public internet"), "", 0);
			return;
		}
		if ((options as { all?: boolean }).all) (callback as unknown as (e: null, a: typeof list) => void)(null, list);
		else callback(null, list[0].address, list[0].family);
	});
};
const publicAgent = new Agent({ connect: { lookup: publicLookup }, headersTimeout: 20_000, bodyTimeout: 20_000 });

function htmlToText(html: string): { title: string; text: string } {
	const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
	const text = html
		.replaceAll(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
		.replaceAll(/<(br|p|div|li|h[1-6]|tr|section|article)[^>]*>/gi, "\n")
		.replaceAll(/<[^>]+>/g, " ")
		.replaceAll("&nbsp;", " ")
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll(/[ \t]+/g, " ")
		.replaceAll(/\n\s*\n+/g, "\n\n")
		.trim();
	return { title, text };
}

// Reads a public web page for Task mode (TiinyOS reads pages on the user's computer). Only http(s) URLs
// on public addresses: the model must not reach this server's network or the device.
export async function fetchPage(rawUrl: string, signal?: AbortSignal): Promise<string> {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new Error(`Not a URL: ${rawUrl}`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https pages can be read");
	const host = url.hostname.replaceAll(/^\[|\]$/g, "");
	if (isIP(host) && isPrivate(host)) throw new Error("That address is not on the public internet");
	let response: Awaited<ReturnType<typeof fetch>>;
	try {
		response = await fetch(url, {
			dispatcher: publicAgent,
			redirect: "manual",
			signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
			headers: { "User-Agent": "tiiny-web task mode", Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5" },
		});
	} catch (error) {
		const cause = (error as { cause?: Error }).cause;
		throw new Error(cause?.message ?? (error instanceof Error ? error.message : String(error)));
	}
	if (response.status >= 300 && response.status < 400) {
		const location = response.headers.get("location");
		if (!location) throw new Error(`Redirect without a location (${response.status})`);
		return fetchPage(new URL(location, url).toString(), signal);
	}
	if (!response.ok) throw new Error(`The page answered ${response.status}`);
	const reader = response.body?.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (reader) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.length;
		chunks.push(value);
		if (size > MAX_BYTES) {
			await reader.cancel();
			break;
		}
	}
	const body = Buffer.concat(chunks).toString("utf8");
	const type = response.headers.get("content-type") ?? "";
	const { title, text } = type.includes("html") ? htmlToText(body) : { title: "", text: body };
	const clipped = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…(truncated)` : text;
	return `${title ? `Title: ${title}\n` : ""}URL: ${url.toString()}\n\n${clipped}`;
}
