import { expect, test } from "@playwright/test";

import { devicePost, runningModelIds, signIn } from "./helpers";

// Small (1% NPU) model so the test never disturbs models other clients are using.
const TEST_MODEL = process.env.E2E_TEST_MODEL ?? "Qwen/Qwen3-Embedding-0.6B";

// A failed run must not leave the test model loaded for the next one.
test.afterEach(async () => {
	const running = await runningModelIds();
	if (running.includes(TEST_MODEL)) await devicePost(`/api/v1/models/${TEST_MODEL}/stop`);
});

test("#2 + xflow A: load a model from the UI, see it on the dashboard, unload it", async ({ page }) => {
	expect(await runningModelIds(), `${TEST_MODEL} must not be loaded before the test`).not.toContain(TEST_MODEL);
	const othersBefore = await runningModelIds();

	await signIn(page);
	await page.getByRole("link", { name: "Models" }).click();
	await expect(page).toHaveURL(/\/dashboard\/models$/);

	const row = page.getByTestId(`model-${TEST_MODEL}`);
	const status = row.locator(".MuiChip-label");
	await expect(status).toHaveText("not loaded");
	await row.getByRole("button", { name: "Load" }).click();
	await expect(row.getByRole("status")).toBeVisible();
	await expect(page.getByRole("alert").filter({ hasText: "loaded." })).toBeVisible({ timeout: 5 * 60_000 });
	await expect(status).toHaveText("loaded");
	await expect(row.getByRole("button", { name: "Unload" })).toBeVisible();
	expect(await runningModelIds()).toContain(TEST_MODEL);
	await page.screenshot({ path: "test-results/models-loaded.png", fullPage: true });

	// The overview's first poll is one round of device calls, which the device sometimes answers slowly.
	await page.getByRole("link", { name: "Overview" }).click();
	await expect(page.getByTestId(`running-${TEST_MODEL}`)).toContainText(TEST_MODEL, { timeout: 15_000 });
	await page.screenshot({ path: "test-results/dashboard-with-test-model.png", fullPage: true });

	await page.getByRole("link", { name: "Models" }).click();
	await row.getByRole("button", { name: "Unload" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Unload" }).click();
	await expect(page.getByRole("alert").filter({ hasText: "unloaded." })).toBeVisible({ timeout: 2 * 60_000 });
	await expect(status).toHaveText("not loaded");
	expect(await runningModelIds()).not.toContain(TEST_MODEL);

	await page.getByRole("link", { name: "Overview" }).click();
	// The card is there whether or not any model is loaded (the table only when one is).
	await expect(page.getByText("Loaded models", { exact: true })).toBeVisible();
	await expect(page.getByTestId(`running-${TEST_MODEL}`)).toHaveCount(0);
	expect(await runningModelIds()).toEqual(othersBefore);
});
