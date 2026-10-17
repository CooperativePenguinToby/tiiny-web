import { expect, test } from "@playwright/test";

import { deviceGet, signIn } from "./helpers";

// A small LoRA for the store's Z-Image-Turbo; the device reports it importable.
const LORA_REPO = process.env.E2E_HF_LORA ?? "tarn59/pixel_art_style_lora_z_image_turbo";
const LORA_BASE = process.env.E2E_HF_BASE ?? "Tongyi-MAI/Z-Image-Turbo";

test("#6 find compatible HF repos for a base model and check one with the device", async ({ page }) => {
	await signIn(page);
	await page.getByRole("link", { name: "Hugging Face" }).click();
	await page.getByRole("combobox", { name: "Base model" }).click();
	await page.getByRole("option", { name: new RegExp(`^${LORA_BASE}( \\(on device\\))?$`) }).click();
	await page.getByRole("textbox", { name: "Search (optional)" }).fill("pixel_art");
	await page.getByRole("button", { name: "Search Hugging Face" }).click();
	const row = page.getByTestId(`hf-${LORA_REPO}`);
	await expect(row).toContainText("LoRA adapter", { timeout: 30_000 });
	await row.getByRole("button", { name: "Check" }).click();

	const verdict = page.getByTestId("hf-verdict");
	await expect(verdict).toContainText(LORA_REPO, { timeout: 2 * 60_000 });
	await expect(verdict).toContainText("compatible");
	await expect(verdict).not.toContainText("not compatible");
	await expect(verdict).toContainText(`base model ${LORA_BASE}`);
	await expect(verdict.getByRole("button", { name: "Import to device" })).toBeVisible();
	await page.screenshot({ path: "test-results/hf-compatible.png", fullPage: true });
});

test("#5 an unsupported repo gets the device's reason", async ({ page }) => {
	await signIn(page);
	await page.getByRole("link", { name: "Hugging Face" }).click();
	await page.getByRole("textbox", { name: "Hugging Face repo" }).fill("https://huggingface.co/Qwen/Qwen3-0.6B");
	await page.getByRole("button", { name: "Check" }).click();
	const verdict = page.getByTestId("hf-verdict");
	await expect(verdict).toContainText("not compatible", { timeout: 2 * 60_000 });
	await expect(verdict).toContainText("HF_BASE_MODEL_UNSUPPORTED");
	await expect(verdict.getByRole("button", { name: "Import to device" })).toHaveCount(0);
});

test("#5 import starts with progress and Cancel stops it", async ({ page }) => {
	await signIn(page);
	await page.getByRole("link", { name: "Hugging Face" }).click();
	await page.getByRole("textbox", { name: "Hugging Face repo" }).fill(LORA_REPO);
	await page.getByRole("button", { name: "Check" }).click();
	const verdict = page.getByTestId("hf-verdict");
	await expect(verdict.getByRole("button", { name: "Import to device" })).toBeVisible({ timeout: 2 * 60_000 });
	await verdict.getByRole("button", { name: "Import to device" }).click();

	await expect(verdict.getByRole("status")).toBeVisible();
	const cancel = verdict.getByRole("button", { name: "Cancel import" });
	await expect(cancel).toBeEnabled({ timeout: 60_000 });
	await page.screenshot({ path: "test-results/hf-importing.png", fullPage: true });
	await cancel.click();
	await expect(page.getByRole("alert").filter({ hasText: "Import cancelled." })).toBeVisible({ timeout: 2 * 60_000 });

	const list = await deviceGet<{ data: { model_id: string }[] }>("/api/v1/models/?including_downloading=true");
	expect(list.data.map((model) => model.model_id)).not.toContain(LORA_REPO);
});
