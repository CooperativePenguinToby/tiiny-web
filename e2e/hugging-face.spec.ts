import { expect, test, type Page } from "@playwright/test";

import { deviceGet, signIn } from "./helpers";

// A small LoRA for the store's Z-Image-Turbo; the device reports it importable.
const LORA_REPO = process.env.E2E_HF_LORA ?? "tarn59/pixel_art_style_lora_z_image_turbo";
const LORA_BASE = process.env.E2E_HF_BASE ?? "Tongyi-MAI/Z-Image-Turbo";
// A LoRA the device accepts once its store base model is downloaded; that base must not be on the device.
const NEEDS_BASE_REPO = process.env.E2E_HF_NEEDS_BASE ?? "xocialize/tryon-FLUX.2-klein-4B-lora";
const NEEDS_BASE_BASE = process.env.E2E_HF_NEEDS_BASE_BASE ?? "black-forest-labs/FLUX.2-klein-4B";

async function searchBase(page: Page, query: string): Promise<void> {
	await signIn(page);
	await page.getByRole("link", { name: "Hugging Face" }).click();
	await page.getByRole("combobox", { name: "Base model" }).click();
	await page.getByRole("option", { name: new RegExp(String.raw`^${LORA_BASE}( \(on device\))?$`) }).click();
	await page.getByRole("textbox", { name: "Search (optional)" }).fill(query);
	await page.getByRole("button", { name: "Search Hugging Face" }).click();
}

async function setSwitch(page: Page, label: string, isOn: boolean): Promise<void> {
	const toggle = page.getByRole("switch", { name: label });
	if ((await toggle.isChecked()) !== isOn) await toggle.click();
}

test("#6 search results are checked against the device automatically", async ({ page }) => {
	await searchBase(page, "pixel_art");
	await setSwitch(page, "Auto-check results", true);
	const row = page.getByTestId(`hf-${LORA_REPO}`);
	await expect(row).toContainText("LoRA adapter", { timeout: 30_000 });
	await expect(row.getByTestId("hf-verdict-cell")).toHaveText("compatible", { timeout: 2 * 60_000 });
	const summary = page.getByTestId("hf-check-summary");
	await expect(summary).toHaveText(/^Checked (\d+) of \1 · \d+ compatible/, { timeout: 3 * 60_000 });
	await page.screenshot({ path: "test-results/hf-auto-checked.png", fullPage: true });

	await row.getByRole("button", { name: "Details" }).click();
	const verdict = page.getByTestId("hf-verdict");
	await expect(verdict).toContainText(LORA_REPO, { timeout: 2 * 60_000 });
	await expect(verdict.locator(".MuiChip-label").first()).toHaveText("compatible");
	await expect(verdict).toContainText(`base model ${LORA_BASE}`);
	await expect(verdict.getByRole("button", { name: "Import to device" })).toBeVisible();
});

test("#6 compatible-only hides repos the device rejects; auto-check can be turned off", async ({ page }) => {
	// Fine-tunes of the base include full repos the importer cannot read, so some are incompatible.
	await searchBase(page, "");
	await setSwitch(page, "Auto-check results", true);
	await setSwitch(page, "Compatible only", false);
	const summary = page.getByTestId("hf-check-summary");
	await expect(summary).toHaveText(/^Checked (\d+) of \1 /, { timeout: 5 * 60_000 });
	const notCompatible = page.getByTestId("hf-verdict-cell").filter({ hasText: "not compatible" });
	const rejected = await notCompatible.count();
	expect(rejected, "expected at least one incompatible repo among the results").toBeGreaterThan(0);
	await setSwitch(page, "Compatible only", true);
	await expect(notCompatible).toHaveCount(0);
	await expect(summary).toContainText(`${rejected} incompatible hidden`);

	await setSwitch(page, "Auto-check results", false);
	await page.getByRole("textbox", { name: "Search (optional)" }).fill("pixel");
	await page.getByRole("button", { name: "Search Hugging Face" }).click();
	await expect(page.getByTestId(`hf-${LORA_REPO}`)).toBeVisible({ timeout: 30_000 });
	// Verdicts from the earlier run are kept; repos not seen before stay unchecked.
	await expect(page.getByTestId("hf-verdict-cell").filter({ hasText: "checking" })).toHaveCount(0);
	await page.reload();
	await expect(page.getByRole("switch", { name: "Auto-check results" })).not.toBeChecked();
	await setSwitch(page, "Auto-check results", true);
});

test("#6 the compatibility list reuses recent verdicts", async ({ page }) => {
	await signIn(page);
	const ask = async (): Promise<{ ms: number; body: unknown }> => {
		const started = Date.now();
		const response = await page.request.post("/api/hf/inspect", { data: { repo: LORA_REPO, cached: true } });
		expect(response.ok()).toBe(true);
		return { ms: Date.now() - started, body: await response.json() };
	};
	const first = await ask();
	const second = await ask();
	expect(second.body).toEqual(first.body);
	expect(second.ms, "a cached verdict should not need the device").toBeLessThan(150);
});

test("#6 the base list holds every store model, grouped by the device's verdict", async ({ page }) => {
	await signIn(page);
	await page.getByRole("link", { name: "Hugging Face" }).click();
	const store = await deviceGet<{ model_id: string }[]>("/api/v1/models/online_models");
	await page.getByRole("combobox", { name: "Base model" }).click();
	const listbox = page.getByRole("listbox");
	await expect(listbox.getByRole("option")).toHaveCount(store.length);
	await expect(listbox.getByText("Checking with the device…")).toHaveCount(0, { timeout: 3 * 60_000 });
	await expect(listbox.getByText("Importable bases")).toBeVisible();
	// A language model the device accepts as a base, which a type filter would have hidden.
	const groups = await listbox.locator("li").allTextContents();
	const importable = groups.indexOf("Importable bases");
	const next = groups.findIndex((text, index) => index > importable && text.startsWith("Not "));
	const importableIds = groups.slice(importable + 1, next === -1 ? undefined : next);
	expect(importableIds.some((text) => text.startsWith("Qwen/Qwen3.5-9B"))).toBe(true);
	expect(importableIds.some((text) => text.startsWith(LORA_BASE))).toBe(true);
	await page.screenshot({ path: "test-results/hf-bases.png", fullPage: true });
	await page.keyboard.press("Escape");
});

test("#5 a repo whose base model is not downloaded says which store model to get", async ({ page }) => {
	const local = await deviceGet<{ data: { model_id: string }[] }>("/api/v1/models/?including_downloading=true");
	expect(
		local.data.map((model) => model.model_id),
		`${NEEDS_BASE_BASE} must not be on the device (set E2E_HF_NEEDS_BASE / _BASE to another pair)`
	).not.toContain(NEEDS_BASE_BASE);
	await signIn(page);
	await page.getByRole("link", { name: "Hugging Face" }).click();
	await page.getByRole("textbox", { name: "Hugging Face repo" }).fill(NEEDS_BASE_REPO);
	await page.getByRole("button", { name: "Check" }).click();
	const verdict = page.getByTestId("hf-verdict");
	await expect(verdict.locator(".MuiChip-label").first()).toHaveText("needs base model", { timeout: 2 * 60_000 });
	await expect(verdict).toContainText(`(${NEEDS_BASE_BASE}) is downloaded`);
	await expect(verdict.getByRole("link", { name: "Store" })).toBeVisible();
	await expect(verdict.getByRole("button", { name: "Import to device" })).toHaveCount(0);
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
