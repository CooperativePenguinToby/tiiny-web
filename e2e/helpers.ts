import { lookup } from "node:dns";
import { readFileSync } from "node:fs";
import type { LookupFunction } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

import { expect, type Page } from "@playwright/test";
import { Agent, fetch as undiciFetch } from "undici";

// Independent oracle: reads the device directly (not through the web app) to check what the UI shows.
function deviceTarget(): { baseUrl: string; authKey: string } {
	const file = process.env.TIINY_CONFIG ?? path.join(homedir(), ".local", "tiiny", "config.json");
	const cli = JSON.parse(readFileSync(file, "utf8")) as { deviceAddress: string; account: { authKey: string } };
	return {
		baseUrl: process.env.TIINY_DEVICE_URL ?? `http://${cli.deviceAddress}`,
		authKey: process.env.TIINY_AUTH_KEY ?? cli.account.authKey,
	};
}

export async function deviceGet<T>(pathname: string): Promise<T> {
	const { baseUrl, authKey } = deviceTarget();
	const response = await fetch(`${baseUrl}${pathname}`, { headers: { Authorization: `Bearer ${authKey}` } });
	expect(response.ok, `device GET ${pathname} -> ${response.status}`).toBe(true);
	return (await response.json()) as T;
}

// POSTs to the device and reads the whole response (including event streams) before returning.
export async function devicePost(pathname: string): Promise<string> {
	const { baseUrl, authKey } = deviceTarget();
	const response = await fetch(`${baseUrl}${pathname}`, {
		method: "POST",
		headers: { Authorization: `Bearer ${authKey}` },
	});
	expect(response.ok, `device POST ${pathname} -> ${response.status}`).toBe(true);
	return response.text();
}

export async function runningModelIds(): Promise<string[]> {
	const body = await deviceGet<{ running: string[] }>("/api/v1/models/running");
	return body.running;
}

export async function signIn(page: Page): Promise<void> {
	const password = process.env.ADMIN_PASSWORD;
	if (!password) throw new Error("ADMIN_PASSWORD must be set for e2e");
	await page.goto("/dashboard");
	await expect(page).toHaveURL(/\/auth\/sign-in$/);
	await page.getByRole("textbox", { name: "Password" }).fill(password);
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
}

// Host names the device gateway routes to its services (the main API needs none).
const SERVICE_HOSTS = {
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

export type DeviceService = keyof typeof SERVICE_HOSTS;

// Every service host name resolves to the device (fetch will not send a Host header of its own).
const deviceLookup: LookupFunction = (_hostname, options, callback) => {
	lookup(new URL(deviceTarget().baseUrl).hostname.replaceAll(/^\[|\]$/g, ""), options, callback);
};
const serviceAgent = new Agent({ connect: { lookup: deviceLookup } });

// Sends a request straight to one of the device's services.
export async function deviceCall<T>(
	service: DeviceService | "main",
	pathname: string,
	init: { method?: string; body?: unknown; headers?: Record<string, string>; text?: boolean } = {}
): Promise<T> {
	const { baseUrl, authKey } = deviceTarget();
	const url = new URL(`${baseUrl}${pathname}`);
	if (service !== "main") url.hostname = SERVICE_HOSTS[service];
	const response = await undiciFetch(url, {
		method: init.method ?? "GET",
		dispatcher: serviceAgent,
		headers: {
			Authorization: `Bearer ${authKey}`,
			...(init.body !== undefined && { "Content-Type": "application/json" }),
			...init.headers,
		},
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
	const text = await response.text();
	expect(response.ok, `device ${init.method ?? "GET"} ${service}${pathname} -> ${response.status} ${text}`).toBe(true);
	if (init.text) return text as T;
	return (text ? JSON.parse(text) : null) as T;
}

export function deviceApiKey(): string {
	return deviceTarget().authKey;
}

export function deviceBaseUrl(): string {
	return deviceTarget().baseUrl;
}

// A chat model the feature tests talk to. Loaded when needed and unloaded afterwards only if the test
// loaded it, so a model someone else loaded stays as it was.
export const CHAT_MODEL = process.env.E2E_CHAT_MODEL ?? "Qwen/Qwen3.5-9B";

export async function holdModel(modelId: string): Promise<{ name: string; release: () => Promise<void> }> {
	const running = await runningModelIds();
	const wasLoaded = running.includes(modelId);
	if (!wasLoaded) await devicePost(`/api/v1/models/${modelId}/launch/stream`);
	expect(await runningModelIds()).toContain(modelId);
	const models = await deviceGet<{ data: { model_id: string; display_name: string }[] }>(
		"/api/v1/models/?including_downloading=false"
	);
	return {
		name: models.data.find((model) => model.model_id === modelId)!.display_name,
		release: async () => {
			if (!wasLoaded) await devicePost(`/api/v1/models/${modelId}/stop`);
		},
	};
}

export const holdChatModel = (): Promise<{ name: string; release: () => Promise<void> }> => holdModel(CHAT_MODEL);

// Picks an option of a MUI select by its label.
export async function selectOption(page: Page, label: string, option: string | RegExp): Promise<void> {
	await page.getByRole("combobox", { name: label }).click();
	// A missing option fails quickly instead of waiting out the test.
	await page.getByRole("option", { name: option, exact: typeof option === "string" }).click({ timeout: 30_000 });
}

// Vault wants the device serial alongside the key.
export async function kbCall<T>(
	pathname: string,
	init: { method?: string; body?: unknown; text?: boolean } = {}
): Promise<T> {
	const { device_id: serial } = await deviceCall<{ device_id: string }>("auth", "/api/v1/connect", {
		method: "POST",
		body: {},
	});
	return deviceCall<T>("kb", pathname, { ...init, headers: { "X-Device-Id": serial } });
}

export interface VaultSource {
	source_id: string;
	filename: string;
	finalized: boolean;
	size_bytes: number;
}

export async function vaultFiles(): Promise<VaultSource[]> {
	const list = await kbCall<{ items: VaultSource[] }>("/kb/sources/files?limit=100&offset=0");
	return list.items;
}

// Indexing loads the device's embedding model; tests unload it again if they caused the load.
export const EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-0.6B";

export async function isRunning(modelId: string): Promise<boolean> {
	const running = await runningModelIds();
	return running.includes(modelId);
}

// The device's chat-history service, which identifies the owner by the device serial.
export async function historyCall<T>(pathname: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
	const { device_id: serial } = await deviceCall<{ device_id: string }>("auth", "/api/v1/connect", {
		method: "POST",
		body: {},
	});
	return deviceCall<T>("chatHistory", `/v1/chat${pathname}`, { ...init, headers: { "X-Device-Id": serial } });
}

export interface StoredMessage {
	message_id: string;
	role: string;
	status: string;
	model_id: string;
}

// A stored conversation's messages with their main text, in order.
export async function storedMessages(conversationId: string): Promise<(StoredMessage & { text: string })[]> {
	const { items } = await historyCall<{ items: (StoredMessage & { seq_in_conversation: number })[] }>(
		`/conversations/${conversationId}/messages?limit=100&include_deleted=false`
	);
	const sorted = items.toSorted((a, b) => a.seq_in_conversation - b.seq_in_conversation);
	return Promise.all(
		sorted.map(async (message) => {
			const blocks = await historyCall<{ items: { block_type: string; content_text: string }[] }>(
				`/messages/${message.message_id}/blocks`
			);
			const text = blocks.items
				.filter((block) => block.block_type === "main_text")
				.map((block) => block.content_text)
				.join("\n\n");
			return { ...message, text };
		})
	);
}

export async function conversationIds(): Promise<string[]> {
	const { items } = await historyCall<{ items: { conversation_id: string }[] }>("/conversations?limit=50");
	return items.map((item) => item.conversation_id);
}

// Chats are stored in the device's history; tests that chat delete the conversations they created.
export function forgetNewConversations(): { before: () => Promise<void>; after: () => Promise<void> } {
	let known = new Set<string>();
	return {
		before: async () => {
			known = new Set(await conversationIds());
		},
		after: async () => {
			const ids = await conversationIds();
			for (const id of ids) {
				if (!known.has(id)) await historyCall(`/conversations/${id}`, { method: "DELETE" });
			}
		},
	};
}

// A solid-colour PNG, for tests that need a picture with a known content.
export function solidPng(width: number, height: number, [red, green, blue]: [number, number, number]): Buffer {
	const chunk = (type: string, data: Buffer): Buffer => {
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, crc]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 2, 0, 0, 0], 8);
	const row = Buffer.concat([
		Buffer.from([0]),
		Buffer.alloc(width * 3).map((_value, index) => [red, green, blue][index % 3]),
	]);
	const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
	return Buffer.concat([
		Buffer.from("89504e470d0a1a0a", "hex"),
		chunk("IHDR", header),
		chunk("IDAT", pixels),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

// POSTs JSON straight to the device and reads the whole response (including event streams) as text.
export async function devicePostJson(pathname: string, body: unknown): Promise<string> {
	const { baseUrl, authKey } = deviceTarget();
	const response = await fetch(`${baseUrl}${pathname}`, {
		method: "POST",
		headers: { Authorization: `Bearer ${authKey}`, "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	expect(response.ok, `device POST ${pathname} -> ${response.status}`).toBe(true);
	return response.text();
}

export async function deviceDelete(pathname: string): Promise<void> {
	const { baseUrl, authKey } = deviceTarget();
	const response = await fetch(`${baseUrl}${pathname}`, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${authKey}` },
	});
	expect(response.ok, `device DELETE ${pathname} -> ${response.status}`).toBe(true);
}

// Monday of the device's current week; the device counts token usage per day in its own time zone.
export async function deviceWeekStart(): Promise<string> {
	const context = await deviceCall<{ created_at: string }>("kb", "/kb/user-context");
	const match = /([+-])(\d{2}):(\d{2})$/.exec(context.created_at);
	const offset = match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
	const local = new Date(Date.now() + offset * 60_000);
	local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
	return local.toISOString().slice(0, 10);
}

// Models the device loads on its own: Vault's embedding model and, if daily summaries are on, the
// summary model. Checks that a test left the loaded models as it found them ignore these.
export async function deviceManagedModels(): Promise<string[]> {
	const summary = await kbCall<{ model_id: string }>("/kb/memory/model");
	return [EMBEDDING_MODEL, summary.model_id].filter(Boolean);
}

export async function userLoadedModels(): Promise<string[]> {
	const managed = new Set(await deviceManagedModels());
	const running = await runningModelIds();
	return running.filter((modelId) => !managed.has(modelId));
}

// Sends a chat message and waits for the reply. The device runs its own jobs (daily summaries) on the same
// models and refuses a request while one holds the model ("gave up waiting"); then this waits and resends
// once, as a person would. Any other failure is left for the test to see.
export async function sendChat(page: Page, text: string, timeout = 5 * 60_000): Promise<void> {
	for (let attempt = 1; ; attempt += 1) {
		await page.getByRole("textbox", { name: "Message" }).fill(text);
		await page.getByRole("button", { name: "Send" }).click();
		await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout });
		const busy = page.getByRole("alert").filter({ hasText: "The device gave up waiting" });
		if (attempt > 1 || !(await busy.isVisible())) return;
		await busy.getByRole("button", { name: "Close" }).click();
		await page.waitForTimeout(20_000);
	}
}
