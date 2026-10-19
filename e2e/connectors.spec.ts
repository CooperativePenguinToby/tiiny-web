import { expect, test } from "@playwright/test";

import { deviceCall, signIn } from "./helpers";

const MCP_URL = process.env.E2E_MCP_URL ?? "https://mcp.deepwiki.com/mcp";
const MCP_TOOL = process.env.E2E_MCP_TOOL ?? "read_wiki_structure";

async function serial(): Promise<string> {
	const connect = await deviceCall<{ device_id: string }>("auth", "/api/v1/connect", { method: "POST", body: {} });
	return connect.device_id;
}
const connector = async <T>(pathname: string): Promise<T> =>
	deviceCall<T>("connector", pathname, { headers: { "x-user-id": await serial() } });

async function mcpServers(): Promise<{ id: string; name: string }[]> {
	return connector("/v1/mcp/servers");
}
async function mcpNames(): Promise<string[]> {
	const servers = await mcpServers();
	return servers.map((server) => server.name);
}

async function openConnectors(page: import("@playwright/test").Page): Promise<void> {
	await signIn(page);
	await page.getByRole("link", { name: "Connectors" }).click();
	await expect(page.getByTestId("connector-gmail")).toBeVisible({ timeout: 30_000 });
}

test("#22 each connector shows the device's connection state", async ({ page }) => {
	const status = await connector<{ channels: Record<string, { connected: boolean }> }>("/v1/status");
	const gmail = await connector<{ connected: boolean }>("/v1/gmail/status");
	await openConnectors(page);
	const chip = (key: string) => page.getByTestId(`connector-${key}`).getByTestId("connector-state");
	await expect(chip("gmail")).toHaveText(gmail.connected ? "Connected" : "Not connected");
	for (const key of ["telegram", "discord", "x", "whatsapp", "email"]) {
		await expect(chip(key)).toHaveText(status.channels[key].connected ? "Connected" : "Not connected");
	}
	await page.screenshot({ path: "test-results/connectors.png", fullPage: true });
});

test("#22 account connectors open the provider's sign-in page", async ({ page }) => {
	const before = await connector<{ connected: boolean }>("/v1/gmail/status");
	test.skip(before.connected, "Gmail is already connected");
	await openConnectors(page);
	const card = page.getByTestId("connector-gmail");
	const [signInPage] = await Promise.all([
		page.context().waitForEvent("page"),
		card.getByRole("button", { name: "Connect" }).click(),
	]);
	await expect.poll(() => signInPage.url()).toMatch(/^https:\/\/accounts\.google\.com\//);
	await signInPage.close();
	await expect(card.getByRole("status")).toContainText("Waiting for you to finish signing in");
	await card.getByRole("button", { name: "Cancel" }).click();
	const after = await connector<{ connected: boolean }>("/v1/gmail/status");
	expect(after.connected).toBe(false);
});

test("#22 credentials are checked by the device before anything is saved", async ({ page }) => {
	await openConnectors(page);
	await page.getByTestId("connector-telegram").getByRole("button", { name: "Connect" }).click();
	let dialog = page.getByRole("dialog", { name: "Connect Telegram bot" });
	await dialog.getByLabel("Bot token").fill("123456:not-a-real-token");
	await dialog.getByRole("button", { name: "Connect" }).click();
	await expect(dialog.getByRole("alert")).toContainText("rejected", { timeout: 30_000 });
	await dialog.getByRole("button", { name: "Cancel" }).click();
	const telegram = await connector<{ token_configured: boolean }>("/v1/config/telegram");
	expect(telegram.token_configured).toBe(false);

	await page.getByTestId("connector-email").getByRole("button", { name: "Connect" }).click();
	dialog = page.getByRole("dialog", { name: "Connect Email (IMAP/SMTP)" });
	await dialog.getByLabel("Provider").click();
	await page.getByRole("option", { name: "Other" }).click();
	await dialog.getByLabel("Email address").fill("someone@example.invalid");
	await dialog.getByLabel("App password").fill("not-a-password");
	await dialog.getByLabel("IMAP server").fill("imap.example.invalid");
	await dialog.getByLabel("SMTP server").fill("smtp.example.invalid");
	await dialog.getByRole("button", { name: "Connect" }).click();
	await expect(dialog.getByRole("alert")).toBeVisible({ timeout: 30_000 });
	const email = await connector<{ enabled: boolean; imap_host: string }>("/v1/config/email");
	expect(email.imap_host).not.toBe("imap.example.invalid");
});

test("#22 WhatsApp shows the device's pairing QR code", async ({ page }) => {
	const before = await connector<{ connected: boolean }>("/v1/whatsapp/check");
	test.skip(before.connected, "WhatsApp is already connected");
	await openConnectors(page);
	await page.getByTestId("connector-whatsapp").getByRole("button", { name: "Connect" }).click();
	const qr = page.getByTestId("whatsapp-qr");
	await expect(qr).toBeVisible({ timeout: 30_000 });
	expect(await qr.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(100);
	const bridge = await connector<{ status: string; qr: string | null }>("/v1/whatsapp/bridge/status");
	expect(bridge.qr).toBeTruthy();
	await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
});

test("#22 a custom MCP server is added on the device, lists its tools and is removed", async ({ page }) => {
	test.setTimeout(3 * 60_000);
	const name = `e2e-${Date.now().toString(36)}`;
	await openConnectors(page);
	try {
		await page.getByRole("link", { name: "Add MCP server" }).click();
		const dialog = page.getByRole("dialog", { name: "Add an MCP server" });
		await dialog.getByLabel("Name").fill(name);
		await dialog.getByLabel("URL").fill(MCP_URL);
		await dialog.getByRole("button", { name: "Add" }).click();
		const row = page.getByTestId(`mcp-${name}`);
		await expect(row).toContainText("Connected", { timeout: 60_000 });
		expect(await mcpNames()).toContain(name);

		await row.getByRole("button", { name: "Tools" }).click();
		await expect(row.getByTestId("mcp-tools")).toContainText(MCP_TOOL, { timeout: 60_000 });
		await page.screenshot({ path: "test-results/connectors-mcp.png", fullPage: true });

		await row.getByRole("button", { name: "Remove" }).click();
		await page.getByRole("dialog", { name: "Remove MCP server?" }).getByRole("button", { name: "Remove" }).click();
		await expect(row).toHaveCount(0, { timeout: 30_000 });
		expect(await mcpNames()).not.toContain(name);
	} finally {
		const servers = await mcpServers();
		for (const server of servers) {
			if (server.name === name) {
				await deviceCall("connector", `/v1/mcp/servers/${server.id}`, { method: "DELETE", text: true });
			}
		}
	}
});
