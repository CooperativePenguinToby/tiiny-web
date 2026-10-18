import { expect, test } from "@playwright/test";

import {
	CHAT_MODEL,
	deviceDelete,
	deviceGet,
	devicePost,
	devicePostJson,
	forgetNewConversations,
	isRunning,
	runningModelIds,
	selectOption,
	signIn,
	userLoadedModels,
} from "./helpers";

const DOWNLOAD_MODEL = process.env.E2E_PAUSE_MODEL ?? "Qwen/Qwen3-Embedding-4b";
const BIG_MODEL = process.env.E2E_CHAT_LOAD_MODEL ?? "Qwen/Qwen3.6-35B-A3B";
const IMAGE_MODEL = process.env.E2E_IMAGE_MODEL ?? "Tongyi-MAI/Z-Image-Turbo";
const ASR_MODEL = process.env.E2E_TEST_MODEL ?? "Qwen/Qwen3-ASR-1.7B";
const conversations = forgetNewConversations();
test.beforeEach(conversations.before);
test.afterEach(conversations.after);

interface Online {
	model_id: string;
	name: string;
	context_window: number | null;
	image_size?: string;
	steps?: number;
	thinking: { levels: string[] };
}
interface Local {
	model_id: string;
	status: string;
	display_name: string;
}

async function localStatus(modelId: string): Promise<string> {
	const list = await deviceGet<{ data: Local[] }>("/api/v1/models/?including_downloading=true");
	return list.data.find((model) => model.model_id === modelId)?.status ?? "absent";
}

async function displayName(modelId: string): Promise<string> {
	const list = await deviceGet<{ data: Local[] }>("/api/v1/models/?including_downloading=false");
	return list.data.find((model) => model.model_id === modelId)!.display_name;
}

async function unloadIfRunning(...modelIds: string[]): Promise<void> {
	for (const modelId of modelIds) if (await isRunning(modelId)) await devicePost(`/api/v1/models/${modelId}/stop`);
}

test("#20 the store shows a model's details", async ({ page }) => {
	const online = await deviceGet<Online[]>("/api/v1/models/online_models");
	const text = online.find((model) => model.context_window && model.thinking.levels.length > 0)!;
	const image = online.find((model) => model.image_size)!;
	await signIn(page);
	await page.getByRole("link", { name: "Store" }).click();
	await page.getByTestId(`store-${text.model_id}`).getByRole("button", { name: text.name, exact: true }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByTestId("detail-Context window")).toContainText(
		`${text.context_window!.toLocaleString("en-US")} tokens`
	);
	await expect(dialog.getByTestId("detail-Reasoning")).toContainText(text.thinking.levels.join(", "));
	await page.screenshot({ path: "test-results/model-details.png" });
	await dialog.getByRole("button", { name: "Close" }).click();

	await page.getByTestId(`store-${image.model_id}`).getByRole("button", { name: image.name, exact: true }).click();
	await expect(dialog.getByTestId("detail-Image size")).toContainText(image.image_size!);
	await expect(dialog.getByTestId("detail-Default steps")).toContainText(String(image.steps));
});

test("#20 a store download can be paused, resumed and cancelled", async ({ page }) => {
	test.setTimeout(5 * 60_000);
	expect(await localStatus(DOWNLOAD_MODEL), `${DOWNLOAD_MODEL} must not be on the device`).toBe("absent");
	await signIn(page);
	await page.getByRole("link", { name: "Store" }).click();
	const row = page.getByTestId(`store-${DOWNLOAD_MODEL}`);
	try {
		await row.getByRole("button", { name: "Download" }).click();
		await expect.poll(() => localStatus(DOWNLOAD_MODEL), { timeout: 60_000 }).toBe("downloading");
		await row.getByRole("button", { name: "Pause" }).click();
		await expect.poll(() => localStatus(DOWNLOAD_MODEL), { timeout: 60_000 }).toBe("download_stop");
		await expect(page.getByRole("alert").filter({ hasText: "paused. Resume it any time." })).toBeVisible();
		await expect(row).toContainText(/paused \d+%/, { timeout: 30_000 });

		await row.getByRole("button", { name: "Resume" }).click();
		await expect.poll(() => localStatus(DOWNLOAD_MODEL), { timeout: 60_000 }).toBe("downloading");
		await row.getByRole("button", { name: "Pause" }).click();
		await expect(row.getByRole("button", { name: "Cancel" })).toBeVisible({ timeout: 60_000 });
		await row.getByRole("button", { name: "Cancel" }).click();
		await expect(page.getByRole("alert").filter({ hasText: "cancelled" })).toBeVisible();
		await expect.poll(() => localStatus(DOWNLOAD_MODEL), { timeout: 60_000 }).toBe("absent");
	} finally {
		// Never leave a partial download behind.
		if ((await localStatus(DOWNLOAD_MODEL)) !== "absent") {
			await devicePostJson(`/api/v1/models/${DOWNLOAD_MODEL}/pause_download`, { model_id: DOWNLOAD_MODEL }).catch(
				() => ""
			);
			await deviceDelete(`/api/v1/models/${DOWNLOAD_MODEL}`);
		}
	}
});

test("#20 Unload all releases every loaded model", async ({ page }) => {
	test.setTimeout(5 * 60_000);
	await devicePost(`/api/v1/models/${ASR_MODEL}/launch/stream`);
	expect(await runningModelIds()).toContain(ASR_MODEL);
	await signIn(page);
	await page.getByRole("link", { name: "Models" }).click();
	await page.getByRole("button", { name: "Unload all" }).click();
	await page.getByRole("dialog", { name: "Unload all models?" }).getByRole("button", { name: "Unload all" }).click();
	await expect(page.getByRole("alert").filter({ hasText: "All models unloaded." })).toBeVisible({
		timeout: 2 * 60_000,
	});
	// The device may reload its own Vault and summary models right away.
	expect(await userLoadedModels()).toEqual([]);
});

test("#20 Interrupt stops what a model is working on", async ({ page }) => {
	test.setTimeout(10 * 60_000);
	const wasLoaded = await isRunning(CHAT_MODEL);
	if (!wasLoaded) await devicePost(`/api/v1/models/${CHAT_MODEL}/launch/stream`);
	try {
		// Another client's long generation, straight to the device.
		const target = await deviceGet<{ data: { id: string }[] }>("/v1/models");
		expect(target.data.map((model) => model.id)).toContain(CHAT_MODEL);
		const stream = fetchGeneration();
		await expect.poll(async () => activeRequests(), { timeout: 60_000 }).toBeGreaterThan(0);

		await signIn(page);
		await page.getByRole("link", { name: "Models" }).click();
		await page.getByTestId(`model-${CHAT_MODEL}`).getByRole("button", { name: "Interrupt" }).click();
		await expect(page.getByRole("alert").filter({ hasText: "Stopped what" })).toBeVisible();
		expect(await stream).toContain("Interrupted by user");
		await expect.poll(activeRequests, { timeout: 30_000 }).toBe(0);
	} finally {
		if (!wasLoaded) await devicePost(`/api/v1/models/${CHAT_MODEL}/stop`);
	}
});

test("#20 choosing a model that is not loaded in chat loads it, making room when asked", async ({ page }) => {
	test.setTimeout(15 * 60_000);
	await unloadIfRunning(CHAT_MODEL);
	const chatName = await displayName(CHAT_MODEL);
	const bigName = await displayName(BIG_MODEL);
	try {
		await signIn(page);
		await page.getByRole("link", { name: "Chat" }).click();
		await selectOption(page, "Model", `${chatName} (not loaded)`);
		await expect(page.getByTestId("chat-loading")).toBeVisible();
		await expect(page.getByTestId("chat-loading")).toBeHidden({ timeout: 5 * 60_000 });
		expect(await runningModelIds()).toContain(CHAT_MODEL);
		await expect(page.getByRole("combobox", { name: "Model" })).toHaveText(chatName);
		await page.getByRole("textbox", { name: "Message" }).fill("Reply with the single word: ready");
		await page.getByRole("button", { name: "Send" }).click();
		await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 5 * 60_000 });
		await expect(page.getByTestId("message-assistant").last().getByTestId("message-content")).not.toBeEmpty();

		// Fill the NPU so the chat model no longer fits, then choose it again.
		await devicePost(`/api/v1/models/${CHAT_MODEL}/stop`);
		await devicePost(`/api/v1/models/${BIG_MODEL}/launch/stream`);
		await devicePost(`/api/v1/models/${IMAGE_MODEL}/launch/stream`);
		await page.reload();
		await selectOption(page, "Model", `${chatName} (not loaded)`);
		const dialog = page.getByRole("dialog", { name: `Make room for ${chatName}?` });
		await expect(dialog).toContainText(bigName);
		await dialog.getByRole("button", { name: "Cancel" }).click();
		await expect(dialog).toBeHidden();
		expect(await runningModelIds()).toContain(BIG_MODEL);
		await page.getByRole("button", { name: "Load", exact: true }).click();
		await dialog.getByRole("button", { name: "Unload and load" }).click({ timeout: 30_000 });
		await expect(page.getByTestId("chat-loading")).toBeHidden({ timeout: 5 * 60_000 });
		const running = await runningModelIds();
		expect(running).toContain(CHAT_MODEL);
		expect(running).not.toContain(BIG_MODEL);
	} finally {
		await unloadIfRunning(CHAT_MODEL, BIG_MODEL, IMAGE_MODEL);
	}
});

async function activeRequests(): Promise<number> {
	const running = await deviceGet<{ instances: { running: { model_id: string; active_request_count: number }[] } }>(
		"/api/v1/models/running"
	);
	return running.instances.running.find((instance) => instance.model_id === CHAT_MODEL)?.active_request_count ?? 0;
}

// Starts a long generation straight on the device and resolves with the whole stream once it ends.
function fetchGeneration(): Promise<string> {
	return devicePostJson("/v1/chat/completions", {
		model: CHAT_MODEL,
		stream: true,
		thinking_enabled: false,
		messages: [{ role: "user", content: "Count from 1 to 3000, one number per line." }],
	});
}
