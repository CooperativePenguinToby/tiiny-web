import { expect, test } from "@playwright/test";

import { deviceGet, signIn } from "./helpers";

// Installed web agents on the test device: one only on the device's loopback, one on its LAN address.
const LOOPBACK_AGENT = process.env.E2E_LOOPBACK_AGENT ?? "openwebui";
const LAN_AGENT = process.env.E2E_LAN_AGENT ?? "tiinymusic";
const LAN_AGENT_TITLE = process.env.E2E_LAN_AGENT_TITLE ?? "Tiiny Music";

interface Service {
	id: string;
	status: string;
	ports: { host_port: number }[];
}

const services = (): Promise<Service[]> => deviceGet<Service[]>("/api/services");
async function serviceStatus(id: string): Promise<string | undefined> {
	const list = await services();
	return list.find((service) => service.id === id)?.status;
}

test("#7 the agent store lists every agent: web agents to install, desktop agents to download", async ({ page }) => {
	const cloud = await deviceGet<{ app_id: string; installed: boolean }[]>("/api/services/cloud/apps");
	await signIn(page);
	await page.getByRole("link", { name: "Agents" }).click();

	for (const app of cloud.filter((entry) => !entry.installed)) {
		await expect(page.getByTestId(`store-agent-wa-${app.app_id}`)).toContainText("Install on device");
	}
	for (const service of await services()) {
		await expect(page.getByTestId(`agent-${service.id}`)).toBeVisible();
	}
	const kilo = page.getByTestId("desktop-agent-KiloCode-Tiiny");
	await expect(kilo.getByRole("link", { name: /^extension / })).toHaveAttribute("href", /\.vsix$/);
	await expect(page.getByTestId("desktop-agent-tiiny-meeting").getByRole("link")).toHaveCount(3);
	await page.screenshot({ path: "test-results/agents.png", fullPage: true });
});

test("#8 + xflow D: a LAN agent opens through the HTTPS proxy only with a session", async ({ page, browser }) => {
	expect(await serviceStatus(LAN_AGENT), `${LAN_AGENT} must be running`).toBe("running");
	await signIn(page);
	await page.getByRole("link", { name: "Agents" }).click();
	const card = page.getByTestId(`agent-${LAN_AGENT}`);
	const open = card.getByRole("link", { name: "Open" });
	const list = await services();
	const port = list.find((service) => service.id === LAN_AGENT)!.ports[0].host_port;
	await expect(open).toHaveAttribute("href", new RegExp(`^https://[^/]+:${port}/$`));

	const [agentPage] = await Promise.all([page.context().waitForEvent("page"), open.click()]);
	await expect(agentPage).toHaveTitle(LAN_AGENT_TITLE, { timeout: 30_000 });
	expect(new URL(agentPage.url()).protocol).toBe("https:");
	await agentPage.screenshot({ path: "test-results/agent-proxied.png" });

	const stranger = await browser.newContext({ ignoreHTTPSErrors: true });
	const strangerPage = await stranger.newPage();
	const href = await open.getAttribute("href");
	expect(href).not.toBeNull();
	await strangerPage.goto(href!);
	await expect(strangerPage).toHaveURL(/:8443\/auth\/sign-in$/);
	await stranger.close();
});

test("#8 + xflow D: start and stop a device agent; a loopback-only agent is not offered to open", async ({ page }) => {
	expect(await serviceStatus(LOOPBACK_AGENT), `${LOOPBACK_AGENT} must be stopped before the test`).toBe("stopped");
	await signIn(page);
	await page.getByRole("link", { name: "Agents" }).click();
	const card = page.getByTestId(`agent-${LOOPBACK_AGENT}`);
	try {
		await card.getByRole("button", { name: "Start" }).click();
		await expect(page.getByRole("alert").filter({ hasText: "started." })).toBeVisible({ timeout: 3 * 60_000 });
		await expect.poll(() => serviceStatus(LOOPBACK_AGENT), { timeout: 3 * 60_000 }).toBe("running");
		await expect(card.locator(".MuiChip-label")).toHaveText("running", { timeout: 30_000 });
		await expect(card).toContainText("only listens on the device itself");
		await expect(card.getByRole("link", { name: "Open" })).toHaveCount(0);
		await page.screenshot({ path: "test-results/agent-running.png", fullPage: true });
	} finally {
		// Stop is offered while the agent is running, starting, or in the device's error state.
		await card.getByRole("button", { name: "Stop" }).click({ timeout: 60_000 });
		await expect(page.getByRole("alert").filter({ hasText: "stopped." })).toBeVisible({ timeout: 3 * 60_000 });
	}
	await expect.poll(() => serviceStatus(LOOPBACK_AGENT), { timeout: 2 * 60_000 }).toBe("stopped");
	await expect(card.locator(".MuiChip-label")).toHaveText("stopped", { timeout: 30_000 });
});

test("#8 deleting an agent asks first; cancelling keeps it installed", async ({ page }) => {
	await signIn(page);
	await page.getByRole("link", { name: "Agents" }).click();
	const card = page.getByTestId(`agent-${LOOPBACK_AGENT}`);
	await card.getByRole("button", { name: "Delete" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toContainText("removes the agent from the device");
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toHaveCount(0);
	expect(await serviceStatus(LOOPBACK_AGENT)).toBeDefined();
	await expect(card).toBeVisible();
});
