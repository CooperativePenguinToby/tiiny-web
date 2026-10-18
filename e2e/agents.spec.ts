import { expect, test } from "@playwright/test";

import { deviceGet, signIn } from "./helpers";

// Installed web agents on the test device. Open WebUI listens only on the device's loopback and is
// reached through the device gateway's virtual host; Tiiny Music must be running.
const START_STOP_AGENT = process.env.E2E_START_STOP_AGENT ?? "openwebui";
const START_STOP_AGENT_TITLE = process.env.E2E_START_STOP_AGENT_TITLE ?? "Open WebUI";
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

test("#8 + xflow D: start Open WebUI, open it through the HTTPS proxy (websocket included), stop it", async ({
	page,
}) => {
	// Leaves the agent as it found it: started and stopped only if it was stopped.
	const initial = await serviceStatus(START_STOP_AGENT);
	expect(["running", "stopped"]).toContain(initial);
	await signIn(page);
	await page.getByRole("link", { name: "Agents" }).click();
	const card = page.getByTestId(`agent-${START_STOP_AGENT}`);
	try {
		if (initial === "stopped") {
			await card.getByRole("button", { name: "Start" }).click();
			await expect(page.getByRole("alert").filter({ hasText: "started." })).toBeVisible({ timeout: 3 * 60_000 });
			await expect.poll(() => serviceStatus(START_STOP_AGENT), { timeout: 3 * 60_000 }).toBe("running");
		}
		await expect(card.locator(".MuiChip-label")).toHaveText("running", { timeout: 30_000 });
		const open = card.getByRole("link", { name: "Open" });
		await expect(open).toBeVisible({ timeout: 30_000 });

		const [agentPage] = await Promise.all([page.context().waitForEvent("page"), open.click()]);
		const socket = await agentPage.waitForEvent("websocket", {
			predicate: (ws) => ws.url().includes("/ws/socket.io/"),
			timeout: 2 * 60_000,
		});
		await socket.waitForEvent("framereceived", { timeout: 60_000 });
		expect(socket.url()).toMatch(/^wss:\/\//);
		await expect(agentPage).toHaveTitle(START_STOP_AGENT_TITLE, { timeout: 60_000 });
		// Past Open WebUI's own sign-in: its chat input is up.
		await expect(agentPage.locator("#chat-input")).toBeVisible({ timeout: 2 * 60_000 });
		await agentPage.screenshot({ path: "test-results/agent-open-webui.png" });
		await agentPage.close();
	} finally {
		if (initial === "stopped") {
			await card.getByRole("button", { name: "Stop" }).click({ timeout: 60_000 });
			await expect(page.getByRole("alert").filter({ hasText: "stopped." })).toBeVisible({ timeout: 3 * 60_000 });
		}
	}
	await expect.poll(() => serviceStatus(START_STOP_AGENT), { timeout: 2 * 60_000 }).toBe(initial);
});

test("#8 deleting an agent asks first; cancelling keeps it installed", async ({ page }) => {
	await signIn(page);
	await page.getByRole("link", { name: "Agents" }).click();
	const card = page.getByTestId(`agent-${START_STOP_AGENT}`);
	await card.getByRole("button", { name: "Delete" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toContainText("removes the agent from the device");
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toHaveCount(0);
	expect(await serviceStatus(START_STOP_AGENT)).toBeDefined();
	await expect(card).toBeVisible();
});
