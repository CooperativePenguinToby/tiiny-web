import { expect, test } from "@playwright/test";

import {
	CHAT_MODEL,
	conversationIds,
	EMBEDDING_MODEL,
	forgetNewConversations,
	holdModel,
	kbCall,
	selectOption,
	sendChat,
	signIn,
	vaultFiles,
} from "./helpers";

const IMAGE_MODEL = process.env.E2E_IMAGE_MODEL ?? "Tongyi-MAI/Z-Image-Turbo";
const REPLY = 6 * 60_000;
const conversations = forgetNewConversations();
test.beforeEach(conversations.before);
test.afterEach(conversations.after);

// The parity campaign's whole-app path, one signed-in session through the real shell.
test("whole app (parity): device settings → Vault file → Task mode answers from it → History → image", async ({
	page,
}) => {
	test.setTimeout(25 * 60_000);
	const stamp = Date.now().toString(36);
	const name = `whole-app-${stamp}.txt`;
	// Loaded first: the device cannot auto-load it for indexing once 9B and the image model fill the NPU.
	const embedder = await holdModel(EMBEDDING_MODEL);
	const writer = await holdModel(CHAT_MODEL);
	const painter = await holdModel(IMAGE_MODEL);
	try {
		await signIn(page);
		await page.getByRole("link", { name: "Settings" }).click();
		await expect(page.getByTestId("settings-device").getByTestId("device-serial")).toHaveText(/^TNY/);

		await page.getByRole("link", { name: "Vault" }).click();
		await page.getByLabel("Files to upload").setInputFiles({
			name,
			mimeType: "text/plain",
			buffer: Buffer.from(`Expedition log ${stamp}. The base camp on Mount Verdane is at 4,180 metres.`),
		});
		await expect(page.getByRole("alert").filter({ hasText: `${name} added to Vault.` })).toBeVisible({
			timeout: 3 * 60_000,
		});

		await page.getByRole("link", { name: "Chat" }).click();
		await selectOption(page, "Model", writer.name);
		await page.getByRole("button", { name: "Task", exact: true }).click();
		await sendChat(page, `Search my Vault: at what altitude is the base camp on Mount Verdane (log ${stamp})?`, REPLY);
		const answer = page.getByTestId("message-assistant").last();
		await expect(answer.getByTestId("task-step").first()).toContainText("Searched Vault");
		await expect(answer.getByTestId("message-content")).toContainText(/4[,.]?180/);
		await expect(page).toHaveURL(/[?&]c=[\w-]+/);
		const conversationId = new URL(page.url()).searchParams.get("c")!;
		expect(await conversationIds()).toContain(conversationId);

		await page.getByRole("link", { name: "History" }).click();
		await expect(page.getByTestId(`conversation-${conversationId}`)).toContainText("Search my Vault: at what altitude");

		await page.getByRole("link", { name: "Chat" }).click();
		await selectOption(page, "Model", painter.name);
		await page.getByRole("textbox", { name: "Message" }).fill("a tent at a mountain base camp, dawn");
		await page.getByRole("button", { name: "Send" }).click();
		await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: REPLY });
		const picture = page.getByTestId("message-assistant").last().getByRole("img");
		await expect(picture).toBeVisible();
		expect(await picture.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
		await picture.evaluate((image: HTMLImageElement) => image.decode());
		await picture.screenshot({ path: "test-results/whole-app-image.png" });
		await picture.scrollIntoViewIfNeeded();
		await page.screenshot({ path: "test-results/whole-app-parity.png", fullPage: true });
	} finally {
		const storedFiles = await vaultFiles();
		for (const file of storedFiles) {
			if (file.filename === name)
				await kbCall("/kb/delete-memory", { method: "POST", body: { source_id: file.source_id } });
		}
		await painter.release();
		await writer.release();
		await embedder.release();
	}
});
