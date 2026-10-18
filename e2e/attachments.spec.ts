import { expect, test, type Page } from "@playwright/test";

import { forgetNewConversations, historyCall, holdChatModel, selectOption, signIn, solidPng } from "./helpers";

const REPLY = { timeout: 5 * 60_000 };
const conversations = forgetNewConversations();
test.beforeEach(conversations.before);
test.afterEach(conversations.after);

const lastReply = (page: Page) => page.getByTestId("message-assistant").last().getByTestId("message-content");

async function openChat(page: Page, modelName: string): Promise<void> {
	await signIn(page);
	await page.getByRole("link", { name: "Chat" }).click();
	await selectOption(page, "Model", modelName);
}

async function sendAndWait(page: Page, text: string): Promise<string> {
	await page.getByRole("textbox", { name: "Message" }).fill(text);
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Send" })).toBeVisible(REPLY);
	const reply = await lastReply(page).textContent();
	return reply ?? "";
}

test("#18 an attached image is seen by a vision model and kept with the conversation", async ({ page }) => {
	test.setTimeout(10 * 60_000);
	const model = await holdChatModel();
	try {
		await openChat(page, model.name);
		await page.getByLabel("Files to attach").setInputFiles({
			name: "swatch.png",
			mimeType: "image/png",
			buffer: solidPng(128, 128, [0, 70, 220]),
		});
		const chips = page.getByTestId("attachments");
		await expect(chips.getByText("swatch.png", { exact: true })).toBeVisible({ timeout: 30_000 });
		const reply = await sendAndWait(page, "What single colour fills this image? Answer with one word.");
		expect(reply.toLowerCase()).toContain("blue");

		const conversationId = new URL(page.url()).searchParams.get("c")!;
		const { items } = await historyCall<{ items: { message_id: string; role: string }[] }>(
			`/conversations/${conversationId}/messages?limit=100&include_deleted=false`
		);
		const user = items.find((message) => message.role === "user")!;
		const blocks = await historyCall<{ items: { block_type: string; metadata_json: { name?: string } | null }[] }>(
			`/messages/${user.message_id}/blocks`
		);
		expect(blocks.items.find((block) => block.block_type === "image")?.metadata_json?.name).toBe("swatch.png");

		await page.reload();
		const picture = page.getByTestId("message-user").getByRole("img", { name: "swatch.png" });
		await expect(picture).toBeVisible();
		expect(await picture.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(128);
		await page.screenshot({ path: "test-results/chat-image.png", fullPage: true });
	} finally {
		await model.release();
	}
});

test("#18 an attached document is read by the device and the answer uses it", async ({ page }) => {
	test.setTimeout(10 * 60_000);
	const model = await holdChatModel();
	const crates = 4000 + Math.floor(Math.random() * 999);
	try {
		await openChat(page, model.name);
		await page.getByLabel("Files to attach").setInputFiles({
			name: "inventory.md",
			mimeType: "text/markdown",
			buffer: Buffer.from(`# Inventory\n\nThe warehouse in Tromsø holds ${crates} crates of cloudberries.\n`),
		});
		await expect(page.getByTestId("attachments").getByText("inventory.md", { exact: true })).toBeVisible({
			timeout: 30_000,
		});
		// An attachment alone is enough to send.
		await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
		const reply = await sendAndWait(
			page,
			"How many crates of cloudberries does the warehouse hold? Answer with the number only."
		);
		expect(reply.replaceAll(/\D/g, "")).toContain(String(crates));
		await expect(page.getByTestId("message-user").last().getByText("inventory.md")).toBeVisible();
	} finally {
		await model.release();
	}
});

test("#18 files chat cannot use are refused", async ({ page }) => {
	await signIn(page);
	const response = await page.request.post("/api/chat/attachments", {
		multipart: { file: { name: "setup.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") } },
	});
	expect(response.status()).toBe(400);
});
