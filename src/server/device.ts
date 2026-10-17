import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { Agent, fetch as undiciFetch } from "undici";

// The one client for the Tiiny device HTTP API. Everything the web UI shows or does goes
// through here; the device auth key never leaves the server.

export class DeviceError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

interface DeviceTarget {
	baseUrl: string;
	authKey: string;
}

interface CliConfig {
	deviceAddress?: string;
	account?: { authKey?: string };
}

function readCliConfig(): CliConfig {
	const file = process.env.TIINY_CONFIG ?? path.join(homedir(), ".local", "tiiny", "config.json");
	try {
		return JSON.parse(readFileSync(file, "utf8")) as CliConfig;
	} catch {
		return {};
	}
}

function resolveTarget(): DeviceTarget {
	const cli = readCliConfig();
	const address = cli.deviceAddress?.includes(":") ? `[${cli.deviceAddress}]` : cli.deviceAddress;
	const baseUrl = process.env.TIINY_DEVICE_URL ?? (address ? `http://${address}` : undefined);
	const authKey = process.env.TIINY_AUTH_KEY ?? cli.account?.authKey;
	if (!baseUrl || !authKey) {
		throw new DeviceError(
			"Device not configured: set TIINY_DEVICE_URL and TIINY_AUTH_KEY, or sign in with the tiiny CLI first",
			503
		);
	}
	return { baseUrl: baseUrl.replace(/\/$/, ""), authKey };
}

const msEnv = (name: string, fallback: number): number => Number(process.env[name] ?? fallback);

// Inference is serialized per model on the device and queued requests get no response
// until their turn, so streams need a long wait for headers but a bounded gap between chunks.
const streamAgent = new Agent({
	headersTimeout: msEnv("TIINY_STREAM_WAIT_MS", 15 * 60_000),
	bodyTimeout: msEnv("TIINY_STREAM_IDLE_MS", 5 * 60_000),
});
const requestAgent = new Agent({ headersTimeout: 15_000, bodyTimeout: 15_000 });

async function deviceErrorFrom(response: Response): Promise<DeviceError> {
	const text = await response.text();
	let message = text;
	try {
		const body = JSON.parse(text) as { message?: string; detail?: unknown; error?: unknown };
		const detail = body.detail as { message?: string } | string | undefined;
		message =
			body.message ??
			(typeof detail === "string" ? detail : detail?.message) ??
			(typeof body.error === "string" ? body.error : (body.error as { message?: string } | undefined)?.message) ??
			text;
	} catch {
		// not JSON; keep the raw text
	}
	return new DeviceError(`Device responded ${response.status}: ${message || response.statusText}`, response.status);
}

async function request(
	pathname: string,
	init: { method?: string; body?: unknown; signal?: AbortSignal; stream?: boolean } = {}
): Promise<Response> {
	const { baseUrl, authKey } = resolveTarget();
	let response: Response;
	try {
		response = (await undiciFetch(`${baseUrl}${pathname}`, {
			method: init.method ?? "GET",
			headers: {
				Authorization: `Bearer ${authKey}`,
				...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
			signal: init.signal,
			dispatcher: init.stream ? streamAgent : requestAgent,
		})) as unknown as Response;
	} catch (error) {
		if (init.signal?.aborted) throw error;
		const cause = (error as { cause?: { code?: string; message?: string } }).cause;
		throw new DeviceError(`Device unreachable at ${baseUrl}: ${cause?.code ?? cause?.message ?? String(error)}`, 502);
	}
	if (!response.ok) throw await deviceErrorFrom(response);
	return response;
}

export async function deviceJson<T>(pathname: string, init?: { method?: string; body?: unknown }): Promise<T> {
	const response = await request(pathname, init);
	return (await response.json()) as T;
}

export async function deviceStream(
	pathname: string,
	init: { method?: string; body?: unknown; signal?: AbortSignal }
): Promise<ReadableStream<Uint8Array>> {
	const response = await request(pathname, { ...init, stream: true });
	if (!response.body) throw new DeviceError("Device returned an empty stream", 502);
	return response.body;
}

// Model ids contain a slash (`Qwen/Qwen3.8-27B`); each segment is encoded, the slash kept.
export const modelPath = (modelId: string): string =>
	modelId
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
