import { expect, test } from "@playwright/test";

import { deviceGet, runningModelIds, signIn } from "./helpers";

// A tiny store model (about 110 MB, 0% NPU) so the test is cheap to download and delete.
const STORE_MODEL = process.env.E2E_STORE_MODEL ?? "PaddlePaddle/PP-OCRv6-Small";

async function deviceStatus(modelId: string): Promise<string | undefined> {
	const list = await deviceGet<{ data: { model_id: string; status: string }[] }>(
		"/api/v1/models/?including_downloading=true"
	);
	return list.data.find((model) => model.model_id === modelId)?.status;
}

test("#4 + xflow C: download from the store, load, unload, delete", async ({ page }) => {
	expect(await deviceStatus(STORE_MODEL), `${STORE_MODEL} must not be on the device before the test`).toBeUndefined();
	const runningBefore = await runningModelIds();

	await signIn(page);
	await page.getByRole("link", { name: "Store" }).click();
	await page.getByRole("textbox", { name: "Search store" }).fill(STORE_MODEL.split("/")[1]);
	const storeRow = page.getByTestId(`store-${STORE_MODEL}`);
	const status = storeRow.locator(".MuiChip-label");
	await expect(status).toHaveText("not downloaded");
	await expect(page.getByRole("table", { name: "Store models" }).locator("tbody tr")).toHaveCount(1);
	await storeRow.getByRole("button", { name: "Download" }).click();
	await expect(storeRow.getByRole("status")).toBeVisible();
	await expect(page.getByRole("alert").filter({ hasText: "downloaded." })).toBeVisible({ timeout: 15 * 60_000 });
	expect(await deviceStatus(STORE_MODEL)).toBe("downloaded");
	await expect(status).toHaveText("downloaded");
	await expect(storeRow.getByRole("button", { name: "Download" })).toHaveCount(0);
	await page.screenshot({ path: "test-results/store-downloaded.png", fullPage: true });

	await page.getByRole("link", { name: "Models" }).click();
	const row = page.getByTestId(`model-${STORE_MODEL}`);
	await row.getByRole("button", { name: "Load" }).click();
	await expect(page.getByRole("alert").filter({ hasText: "loaded." })).toBeVisible({ timeout: 5 * 60_000 });
	expect(await runningModelIds()).toContain(STORE_MODEL);
	await row.getByRole("button", { name: "Unload" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Unload" }).click();
	await expect(page.getByRole("alert").filter({ hasText: "unloaded." })).toBeVisible({ timeout: 2 * 60_000 });

	await row.getByRole("button", { name: "Delete" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
	await expect(page.getByRole("alert").filter({ hasText: "deleted." })).toBeVisible({ timeout: 2 * 60_000 });
	await expect(row).toHaveCount(0);
	expect(await deviceStatus(STORE_MODEL)).toBeUndefined();
	expect(await runningModelIds()).toEqual(runningBefore);

	await page.getByRole("link", { name: "Store" }).click();
	await page.getByRole("textbox", { name: "Search store" }).fill(STORE_MODEL.split("/")[1]);
	await expect(status).toHaveText("not downloaded");
	await expect(storeRow.getByRole("button", { name: "Download" })).toBeVisible();
});
