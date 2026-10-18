import { lookup } from "node:dns";
import type { LookupFunction } from "node:net";

import { Agent, fetch as undiciFetch, type FormData } from "undici";

import { resolveDeviceTarget } from "./shared/device-target.mjs";

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

function resolveTarget(): { baseUrl: string; authKey: string } {
	const target = resolveDeviceTarget();
	if (!target) {
		throw new DeviceError(
			"Device not configured: set TIINY_DEVICE_URL and TIINY_AUTH_KEY, or sign in with the tiiny CLI first",
			503
		);
	}
	return target;
}

const msEnv = (name: string, fallback: number): number => Number(process.env[name] ?? fallback);

// The device gateway routes by host name to its services (fetch will not send a Host header of its
// own), so requests name the service in the URL and every name resolves to the device's address.
const deviceLookup: LookupFunction = (_hostname, options, callback) => {
	lookup(new URL(resolveTarget().baseUrl).hostname.replaceAll(/^\[|\]$/g, ""), options, callback);
};
const connect = { lookup: deviceLookup };

// Inference is serialized per model on the device and queued requests get no response
// until their turn, so streams need a long wait for headers but a bounded gap between chunks.
const streamAgent = new Agent({
	connect,
	headersTimeout: msEnv("TIINY_STREAM_WAIT_MS", 15 * 60_000),
	bodyTimeout: msEnv("TIINY_STREAM_IDLE_MS", 5 * 60_000),
});
const requestAgent = new Agent({ connect, headersTimeout: 15_000, bodyTimeout: 15_000 });
// Container start/stop/delete on the device answer only once the operation is under way (~20 s).
const slowAgent = new Agent({ connect, headersTimeout: 5 * 60_000, bodyTimeout: 5 * 60_000 });

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
		// Not JSON. The gateway answers with an HTML page while a service is down (e.g. during a restart).
		if (/^\s*</.test(text)) message = response.statusText || "the service is unavailable";
	}
	return new DeviceError(`Device responded ${response.status}: ${message || response.statusText}`, response.status);
}

// Host names of the device's services; the main API is served on the device's own address.
const serviceHosts = {
	main: undefined,
	auth: "auth.api.tiiny",
	kb: "kb.api.tiiny",
	chatHistory: "chat-history.api.tiiny",
	connector: "connector.api.tiiny",
	wifi: "wifi.api.tiiny",
	upgrade: "hardware-upgrade.api.tiiny",
	agents: "agent-services.api.tiiny",
	backup: "backup.managed.tiiny",
	media: "p8800.api.tiiny",
} as const;

export type DeviceService = keyof typeof serviceHosts;

export interface DeviceRequest {
	method?: string;
	service?: DeviceService;
	headers?: Record<string, string>;
	/** JSON body. */
	body?: unknown;
	/** Multipart body; mutually exclusive with `body`. */
	form?: FormData;
	/** A body sent as is (its Content-Type goes in `headers`). */
	raw?: Buffer;
	signal?: AbortSignal;
	stream?: boolean;
	slow?: boolean;
}

async function request(pathname: string, init: DeviceRequest = {}): Promise<Response> {
	const { baseUrl, authKey } = resolveTarget();
	const host = serviceHosts[init.service ?? "main"];
	const url = new URL(`${baseUrl}${pathname}`);
	if (host) url.hostname = host;
	let response: Response;
	try {
		response = (await undiciFetch(url, {
			method: init.method ?? "GET",
			headers: {
				Authorization: `Bearer ${authKey}`,
				...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
				...init.headers,
			},
			body: init.raw ?? init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
			signal: init.signal,
			dispatcher: init.stream ? streamAgent : init.slow ? slowAgent : requestAgent,
		})) as unknown as Response;
	} catch (error) {
		if (init.signal?.aborted) throw error;
		const cause = (error as { cause?: { code?: string; message?: string } }).cause;
		throw new DeviceError(`Device unreachable at ${baseUrl}: ${cause?.code ?? cause?.message ?? String(error)}`, 502);
	}
	if (!response.ok) throw await deviceErrorFrom(response);
	return response;
}

export async function deviceJson<T>(pathname: string, init?: Omit<DeviceRequest, "stream">): Promise<T> {
	const response = await request(pathname, init);
	return (await response.json()) as T;
}

export async function deviceStream(
	pathname: string,
	init: Omit<DeviceRequest, "stream" | "slow">
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

// The raw response, for binary bodies (files, audio, images) whose headers matter too.
export async function deviceResponse(pathname: string, init?: DeviceRequest): Promise<Response> {
	return request(pathname, init);
}

// The device's serial number, which some services expect as `X-Device-Id`. Asked once per process.
let deviceIdPromise: Promise<string> | null = null;
export function deviceId(): Promise<string> {
	deviceIdPromise ??= deviceJson<{ device_id: string }>("/api/v1/connect", {
		method: "POST",
		service: "auth",
		body: {},
	}).then(
		(body) => body.device_id,
		(error: unknown) => {
			deviceIdPromise = null;
			throw error;
		}
	);
	return deviceIdPromise;
}
