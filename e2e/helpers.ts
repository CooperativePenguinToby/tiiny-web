import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { expect, type Page } from "@playwright/test";

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
