import { lookup } from "node:dns";
import { readFileSync } from "node:fs";
import type { LookupFunction } from "node:net";
import { homedir } from "node:os";
import path from "node:path";

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
	init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
	const { baseUrl, authKey } = deviceTarget();
	const url = new URL(`${baseUrl}${pathname}`);
	if (service !== "main") url.hostname = SERVICE_HOSTS[service];
	const response = await undiciFetch(url, {
		method: init.method ?? "GET",
		dispatcher: serviceAgent,
		headers: {
			Authorization: `Bearer ${authKey}`,
			...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
			...init.headers,
		},
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
	const text = await response.text();
	expect(response.ok, `device ${init.method ?? "GET"} ${service}${pathname} -> ${response.status} ${text}`).toBe(true);
	return (text ? JSON.parse(text) : null) as T;
}

export function deviceApiKey(): string {
	return deviceTarget().authKey;
}

export function deviceBaseUrl(): string {
	return deviceTarget().baseUrl;
}
