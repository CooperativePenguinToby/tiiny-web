import { expect, test, type Page } from "@playwright/test";

import { deviceGet, devicePost, runningModelIds, signIn } from "./helpers";

// A chat model the xflow test loads itself; must fit in the NPU share that is currently free.
const LOAD_MODEL = process.env.E2E_CHAT_LOAD_MODEL ?? "Qwen/Qwen3.6-35B-A3B";
const REPLY_TIMEOUT = 8 * 60_000; // the device may be serving other clients first

async function openChat(page: Page): Promise<void> {
	await signIn(page);
	await page.getByRole("link", { name: "Chat" }).click();
	await expect(page).toHaveURL(/\/dashboard\/chat$/);
	await expect(page.getByRole("combobox", { name: "Model" })).toBeVisible();
}

async function selectOption(page: Page, label: string, option: string): Promise<void> {
	await page.getByRole("combobox", { name: label }).click();
	await page.getByRole("option", { name: option, exact: true }).click();
}

const lastReply = (page: Page) => page.getByTestId("message-assistant").last().getByTestId("message-content");

test("whole app + xflow B: sign in, dashboard, load a chat model, chat with it, unload it", async ({ page }) => {
	const before = await runningModelIds();
	expect(before, `${LOAD_MODEL} must not be loaded before the test`).not.toContain(LOAD_MODEL);
	const models = await deviceGet<{ data: { model_id: string; npu_usage: number; display_name: string }[] }>(
		"/api/v1/models/?including_downloading=false"
	);
	const target = models.data.find((model) => model.model_id === LOAD_MODEL);
	expect(target, `${LOAD_MODEL} must be downloaded`).toBeDefined();
	const { npu_available } = await deviceGet<{ npu_available: number }>("/api/v1/models/npu/status");
	expect(target!.npu_usage, "model must fit in the free NPU share").toBeLessThanOrEqual(npu_available);

	await signIn(page);
	// The card is there whether or not any model is loaded (the table only when one is).
	await expect(page.getByText("Loaded models", { exact: true })).toBeVisible();
	await expect(page.getByTestId(`running-${LOAD_MODEL}`)).toHaveCount(0);
	await page.getByRole("link", { name: "Models" }).click();
	const row = page.getByTestId(`model-${LOAD_MODEL}`);
	await row.getByRole("button", { name: "Load" }).click();
	await expect(page.getByRole("alert").filter({ hasText: "loaded." })).toBeVisible({ timeout: 10 * 60_000 });
	expect(await runningModelIds()).toContain(LOAD_MODEL);

	try {
		await page.getByRole("link", { name: "Overview" }).click();
		// The dashboard's device status can take a while while the device is busy.
		await expect(page.getByTestId(`running-${LOAD_MODEL}`)).toContainText(LOAD_MODEL, { timeout: 30_000 });
		await page.getByRole("link", { name: "Chat" }).click();
		await selectOption(page, "Model", target!.display_name);
		await page.getByRole("textbox", { name: "Message" }).fill("What is 17 + 25? Answer with just the number.");
		await page.getByRole("button", { name: "Send" }).click();
		await expect(lastReply(page)).toContainText("42", { timeout: REPLY_TIMEOUT });
		await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: REPLY_TIMEOUT });
		await page.screenshot({ path: "test-results/chat-loaded-model.png", fullPage: true });
	} finally {
		await page.getByRole("link", { name: "Models" }).click();
		await row.getByRole("button", { name: "Unload" }).click();
		await page.getByRole("dialog").getByRole("button", { name: "Unload" }).click();
		await expect(page.getByRole("alert").filter({ hasText: "unloaded." })).toBeVisible({ timeout: 2 * 60_000 });
	}
	expect(await runningModelIds()).toEqual(before);
	await page.getByRole("link", { name: "Overview" }).click();
	// The card is there whether or not any model is loaded (the table only when one is).
	await expect(page.getByText("Loaded models", { exact: true })).toBeVisible();
	await expect(page.getByTestId(`running-${LOAD_MODEL}`)).toHaveCount(0);
	await page.screenshot({ path: "test-results/whole-app-final.png", fullPage: true });
});

// The chat tests talk to a model this suite loads itself, so other clients' traffic on shared
// models cannot starve them.
test.describe.serial("#3 chat on a model loaded for the tests", () => {
	let loadedName = "";

	test.beforeAll(async () => {
		expect(await runningModelIds(), `${LOAD_MODEL} must not be loaded before the tests`).not.toContain(LOAD_MODEL);
		await devicePost(`/api/v1/models/${LOAD_MODEL}/launch/stream`);
		expect(await runningModelIds()).toContain(LOAD_MODEL);
		const models = await deviceGet<{ data: { model_id: string; display_name: string }[] }>(
			"/api/v1/models/?including_downloading=false"
		);
		loadedName = models.data.find((model) => model.model_id === LOAD_MODEL)!.display_name;
	});

	test.afterAll(async () => {
		await devicePost(`/api/v1/models/${LOAD_MODEL}/stop`);
	});

	test("#3 chat: a prompt streams back a real reply from the device", async ({ page }) => {
		await openChat(page);
		await selectOption(page, "Model", loadedName);
		await selectOption(page, "Thinking", "Off");
		await page.getByRole("textbox", { name: "Message" }).fill("Reply with exactly the single word: pong");
		await page.getByRole("button", { name: "Send" }).click();
		await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
		await expect(lastReply(page)).toContainText(/pong/i, { timeout: REPLY_TIMEOUT });
		await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: REPLY_TIMEOUT });
		await expect(page.getByTestId("message-assistant").last()).not.toContainText("No complete reply");
		await page.screenshot({ path: "test-results/chat-reply.png", fullPage: true });
	});

	test("#3 chat: tokens arrive incrementally and Stop aborts the reply", async ({ page }) => {
		await openChat(page);
		await selectOption(page, "Model", loadedName);
		await selectOption(page, "Thinking", "Off");
		await page
			.getByRole("textbox", { name: "Message" })
			.fill("Count from 1 to 400, one number per line, with no other text.");
		await page.getByRole("button", { name: "Send" }).click();

		const reply = lastReply(page);
		await expect(reply).toContainText("3", { timeout: REPLY_TIMEOUT });
		const lengths = new Set<number>();
		for (let sample = 0; sample < 6; sample += 1) {
			const text = await reply.textContent();
			lengths.add(text?.length ?? 0);
			await page.waitForTimeout(400);
		}
		expect(lengths.size, "reply text should grow while streaming").toBeGreaterThan(2);

		await page.getByRole("button", { name: "Stop" }).click();
		await expect(page.getByTestId("message-assistant").last()).toContainText("Stopped.");
		const stoppedAt = await reply.textContent();
		await page.waitForTimeout(2000);
		expect(await reply.textContent()).toBe(stoppedAt);
		expect(stoppedAt).not.toContain("400");
		await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
		await page.screenshot({ path: "test-results/chat-stopped.png", fullPage: true });
	});
});
