import { expect, test } from "@playwright/test";

import { deviceGet, signIn } from "./helpers";

// Installed web agents on the test device. Open WebUI listens only on the device's loopback and is
// reached through the device gateway's virtual host; Tiiny Music must be running.
const START_STOP_AGENT = process.env.E2E_START_STOP_AGENT ?? "openwebui";
const START_STOP_AGENT_TITLE = process.env.E2E_START_STOP_AGENT_TITLE ?? "Open WebUI";
const LAN_AGENT = process.env.E2E_LAN_AGENT ?? "tiinymusic";
const LAN_AGENT_TITLE = process.env.E2E_LAN_AGENT_TITLE ?? "Tiiny Music";
// Set to the server's AGENT_DOMAIN when it serves agents at `<service id>.<domain>` (which must resolve here).
const AGENT_DOMAIN = process.env.E2E_AGENT_DOMAIN;

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
	// The device answers the agent catalogue slowly at times.
	await expect(page.getByRole("heading", { name: "On this device" })).toBeVisible({ timeout: 60_000 });

	for (const app of cloud) {
		if (app.installed) continue;
		await expect(page.getByTestId(`store-agent-wa-${app.app_id}`)).toContainText("Install on device");
	}
	const deviceServices = await services();
	for (const service of deviceServices) {
		await expect(page.getByTestId(`agent-${service.id}`)).toBeVisible();
	}
	const kilo = page.getByTestId("desktop-agent-KiloCode-Tiiny");
	await expect(kilo.getByRole("link", { name: /^extension / })).toHaveAttribute("href", /\.vsix$/);
	await expect(page.getByTestId("desktop-agent-tiiny-meeting").getByRole("link")).toHaveCount(3);
	await page.screenshot({ path: "test-results/agents.png", fullPage: true });
});

test("#8 + xflow D: a LAN agent opens through the HTTPS proxy only with a session", async ({ page, browser }) => {
	test.skip(Boolean(AGENT_DOMAIN), "the server serves agents on subdomains; covered by the subdomain test");
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
	await expect(agentPage.getByText(LAN_AGENT_TITLE, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
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

test("an agent opens on its subdomain through a one-time link, and on its port too", async ({ page, browser }) => {
	test.skip(!AGENT_DOMAIN, "set E2E_AGENT_DOMAIN to the server's AGENT_DOMAIN");
	expect(await serviceStatus(LAN_AGENT), `${LAN_AGENT} must be running`).toBe("running");
	const appPort = new URL(process.env.BASE_URL ?? "https://localhost:8443").port;
	const agentOrigin = `https://${LAN_AGENT}.${AGENT_DOMAIN}:${appPort}`;
	await signIn(page);
	await page.getByRole("link", { name: "Agents" }).click();
	const open = page.getByTestId(`agent-${LAN_AGENT}`).getByRole("link", { name: "Open" });
	await expect(open).toHaveAttribute("href", `/api/agents/open?id=${LAN_AGENT}`);

	const [agentPage] = await Promise.all([page.context().waitForEvent("page"), open.click()]);
	await expect(agentPage).toHaveTitle(LAN_AGENT_TITLE, { timeout: 30_000 });
	expect(new URL(agentPage.url()).origin).toBe(agentOrigin);
	// Rendered by the agent's own script, so its assets and API calls work on the subdomain too.
	await expect(agentPage.getByText(LAN_AGENT_TITLE, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
	await agentPage.screenshot({ path: "test-results/agent-subdomain.png" });

	// Without a session the agent host refuses; a handoff link works once only.
	const stranger = await browser.newContext({ ignoreHTTPSErrors: true });
	const strangerPage = await stranger.newPage();
	const refused = await strangerPage.goto(`${agentOrigin}/`);
	expect(refused?.status()).toBe(401);
	await expect(strangerPage.locator("body")).toContainText("Sign in to tiiny-web");
	// Links issued back to back (within the same second) are distinct, and each works.
	const [first, handoff] = [
		await page.request.get(`/api/agents/open?id=${LAN_AGENT}`, { maxRedirects: 0 }),
		await page.request.get(`/api/agents/open?id=${LAN_AGENT}`, { maxRedirects: 0 }),
	];
	expect(handoff.status()).toBe(307);
	const link = handoff.headers().location;
	expect(link).not.toBe(first.headers().location);
	expect(link.startsWith(`${agentOrigin}/.tiiny/handoff?token=`)).toBe(true);
	await strangerPage.goto(link);
	await expect(strangerPage).toHaveTitle(LAN_AGENT_TITLE, { timeout: 30_000 });
	const replayContext = await browser.newContext({ ignoreHTTPSErrors: true });
	const replayPage = await replayContext.newPage();
	const replayed = await replayPage.goto(link);
	expect(replayed?.status()).toBe(401);
	await replayContext.close();
	const otherContext = await browser.newContext({ ignoreHTTPSErrors: true });
	const otherPage = await otherContext.newPage();
	await otherPage.goto(first.headers().location);
	await expect(otherPage).toHaveTitle(LAN_AGENT_TITLE, { timeout: 30_000 });
	await otherContext.close();
	await stranger.close();

	// The agent's own port still works alongside its subdomain.
	const deviceServices = await services();
	const port = deviceServices.find((service) => service.id === LAN_AGENT)!.ports[0].host_port;
	const direct = await page.context().newPage();
	await direct.goto(`https://localhost:${port}/`);
	await expect(direct).toHaveTitle(LAN_AGENT_TITLE, { timeout: 30_000 });
	await expect(direct.getByText(LAN_AGENT_TITLE, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
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
