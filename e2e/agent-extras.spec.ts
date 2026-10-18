import { expect, test } from "@playwright/test";

import { deviceCall, signIn } from "./helpers";

const PAUSE_AGENT = process.env.E2E_PAUSE_AGENT ?? "odysseus";

interface Usage {
	service_id: string;
	status: string;
}
interface UpdateCheck {
	service_id: string;
	update_available: boolean;
	latest_version: string;
}

const installStatus = async (): Promise<string> => {
	const status = await deviceCall<{ status: string }>("agents", `/api/services/download/${PAUSE_AGENT}/status`);
	return status.status;
};
const installed = async (): Promise<boolean> => {
	const services = await deviceCall<{ id: string }[]>("agents", "/api/services");
	return services.some((service) => service.id === PAUSE_AGENT);
};

async function openAgents(page: import("@playwright/test").Page): Promise<void> {
	await signIn(page);
	await page.getByRole("link", { name: "Agents" }).click();
	await expect(page.getByRole("heading", { name: "On this device" })).toBeVisible({ timeout: 60_000 });
}

test("#21 installed agents show their CPU and memory use and whether an update exists", async ({ page }) => {
	const usage = await deviceCall<Usage[]>("agents", "/api/services/resource-usage");
	const updates = await deviceCall<UpdateCheck[]>("agents", "/api/services/updates/check");
	await openAgents(page);
	for (const entry of usage.filter((item) => item.status === "running")) {
		await expect(page.getByTestId(`agent-${entry.service_id}`).getByTestId("agent-usage")).toHaveText(
			/^CPU \d+\.\d% · memory \d+(\.\d)? [KMG]?B$/
		);
	}
	for (const check of updates) {
		const card = page.getByTestId(`agent-${check.service_id}`);
		await expect(card.getByRole("button", { name: "Update" })).toHaveCount(check.update_available ? 1 : 0);
		if (check.update_available) await expect(card).toContainText(`${check.latest_version} available`);
	}
	await page.screenshot({ path: "test-results/agents-usage.png", fullPage: true });
});

test("#21 an agent install can be paused, resumed and cancelled", async ({ page }) => {
	test.setTimeout(10 * 60_000);
	expect(await installed(), `${PAUSE_AGENT} must not be installed`).toBe(false);
	await openAgents(page);
	const store = page.getByTestId(`store-agent-wa-${PAUSE_AGENT}`);
	try {
		await store.getByRole("button", { name: "Install on device" }).click();
		await expect.poll(installStatus, { timeout: 2 * 60_000 }).toBe("running");
		await store.getByRole("button", { name: "Pause" }).click();
		await expect(page.getByRole("alert").filter({ hasText: "install paused." })).toBeVisible({ timeout: 2 * 60_000 });
		await expect.poll(installStatus, { timeout: 60_000 }).toBe("paused");

		// The paused install is listed as an agent on the device (the list refreshes slowly, so reload).
		await page.reload();
		await expect(page.getByRole("heading", { name: "On this device" })).toBeVisible({ timeout: 60_000 });
		// Paused very early the device may not list the agent yet: then the store card carries the install.
		const card = page.locator(`[data-testid="agent-${PAUSE_AGENT}"], [data-testid="store-agent-wa-${PAUSE_AGENT}"]`);
		await expect(card).toContainText("Install paused at", { timeout: 60_000 });
		await card.getByRole("button", { name: "Resume" }).click();
		await expect.poll(installStatus, { timeout: 60_000 }).toBe("running");
		await card.getByRole("button", { name: "Pause" }).click();
		await expect.poll(installStatus, { timeout: 60_000 }).toBe("paused");
		await expect(card.getByRole("button", { name: "Cancel install" })).toBeVisible({ timeout: 30_000 });
		await card.getByRole("button", { name: "Cancel install" }).click();
		await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
		await expect.poll(installed, { timeout: 2 * 60_000 }).toBe(false);
	} finally {
		if (await installed()) {
			await deviceCall("agents", "/api/services/download/pause", {
				method: "POST",
				body: { app_id: PAUSE_AGENT },
			}).catch(() => null);
			await deviceCall("agents", `/api/services/${PAUSE_AGENT}`, { method: "DELETE" });
		}
	}
});
