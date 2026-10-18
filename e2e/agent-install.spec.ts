import { writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { deviceGet, signIn } from "./helpers";

// Installs a real agent on the device and leaves it installed, so it only runs when asked:
// E2E_INSTALL_AGENT=<cloud app id, e.g. sillytavern>.
const AGENT = process.env.E2E_INSTALL_AGENT;

async function installed(): Promise<string[]> {
	const services = await deviceGet<{ id: string }[]>("/api/services");
	return services.map((service) => service.id);
}

test("#9 install a web agent from the agent store", async ({ page }) => {
	test.skip(!AGENT, "set E2E_INSTALL_AGENT to install a real agent on the device");
	test.setTimeout(30 * 60_000);
	expect(await installed(), `${AGENT} must not be installed before the test`).not.toContain(AGENT);

	await signIn(page);
	await page.getByRole("link", { name: "Agents" }).click();
	const card = page.getByTestId(`store-agent-wa-${AGENT}`);
	const streamDone = page.waitForResponse("**/api/agents/install", { timeout: 30 * 60_000 });
	await card.getByRole("button", { name: "Install on device" }).click();
	await expect(card.getByRole("status")).toBeVisible();
	await page.screenshot({ path: "test-results/agent-installing.png", fullPage: true });

	const response = await streamDone;
	writeFileSync("test-results/agent-install-stream.txt", await response.body());
	await expect(page.getByRole("alert").filter({ hasText: "installed." })).toBeVisible({ timeout: 60_000 });
	expect(await installed()).toContain(AGENT);
	await expect(page.getByTestId(`agent-${AGENT}`)).toBeVisible({ timeout: 30_000 });
	await page.screenshot({ path: "test-results/agent-installed.png", fullPage: true });
});
