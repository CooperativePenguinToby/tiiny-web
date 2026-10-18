import { expect, test } from "@playwright/test";

import {
	CHAT_MODEL,
	deviceGet,
	deviceWeekStart,
	forgetNewConversations,
	historyCall,
	holdModel,
	selectOption,
	signIn,
	storedMessages,
} from "./helpers";

const IMAGE_MODEL = process.env.E2E_IMAGE_MODEL ?? "Tongyi-MAI/Z-Image-Turbo";
const REPLY = { timeout: 5 * 60_000 };
const conversations = forgetNewConversations();
test.beforeEach(conversations.before);
test.afterEach(conversations.after);

async function appTokens(): Promise<number> {
	const start = await deviceWeekStart();
	const apps = await deviceGet<Record<string, { total_tokens: number }>>(
		`/api/v1/statistics/app_week_usage?start_date=${start}`
	);
	return apps["Tiiny Web"]?.total_tokens ?? 0;
}

test("#19 + xflow I: draw a picture in chat, keep it in the conversation, then chat on in it", async ({ page }) => {
	test.setTimeout(15 * 60_000);
	const painter = await holdModel(IMAGE_MODEL);
	const writer = await holdModel(CHAT_MODEL);
	try {
		await signIn(page);
		await page.getByRole("link", { name: "Chat" }).click();
		await selectOption(page, "Model", painter.name);
		await expect(page.getByRole("combobox", { name: "Thinking" })).toHaveCount(0);
		await selectOption(page, "Size", "768 × 432");
		await page.getByLabel("Steps").fill("4");
		await page.getByRole("textbox", { name: "Message" }).fill("a red apple on a white table, studio photo");
		await page.getByRole("button", { name: "Send" }).click();
		await expect(page.getByRole("button", { name: "Send" })).toBeVisible(REPLY);

		const answer = page.getByTestId("message-assistant").last();
		await expect(answer).toContainText("768 × 432, 4 steps");
		const picture = answer.getByRole("img");
		await expect(picture).toBeVisible();
		const size = await picture.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight]);
		expect(size).toEqual([768, 432]);
		const href = await answer.getByRole("link", { name: "Download" }).getAttribute("href");
		const download = await page.request.get(href!);
		const png = await download.body();
		expect(png.subarray(0, 8)).toEqual(Buffer.from("89504e470d0a1a0a", "hex"));
		await page.screenshot({ path: "test-results/chat-drawn.png", fullPage: true });

		await expect(page).toHaveURL(/[?&]c=[\w-]+/);
		const conversationId = new URL(page.url()).searchParams.get("c")!;
		const drawn = await storedMessages(conversationId);
		expect(drawn.map((message) => [message.role, message.model_id])).toEqual([
			["user", IMAGE_MODEL],
			["assistant", IMAGE_MODEL],
		]);
		const blocks = await historyCall<{ items: { block_type: string }[] }>(`/messages/${drawn[1].message_id}/blocks`);
		expect(blocks.items.map((block) => block.block_type)).toContain("image");

		const before = await appTokens();
		await selectOption(page, "Model", writer.name);
		await page.getByRole("textbox", { name: "Message" }).fill("Name one fruit that is red. One word.");
		await page.getByRole("button", { name: "Send" }).click();
		await expect(page.getByRole("button", { name: "Send" })).toBeVisible(REPLY);
		await expect(page).toHaveURL(new RegExp(`c=${conversationId}`));
		const both = await storedMessages(conversationId);
		expect(both.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant"]);
		await expect.poll(appTokens, { timeout: 30_000 }).toBeGreaterThan(before);

		await page.reload();
		await expect(page.getByTestId("message-assistant").first().getByRole("img")).toBeVisible();
	} finally {
		await writer.release();
		await painter.release();
	}
});

test("#19 sizes the device cannot draw are refused", async ({ page }) => {
	await signIn(page);
	const response = await page.request.post("/api/images", {
		data: { modelId: IMAGE_MODEL, prompt: "x", size: "1000x1000", steps: 9 },
	});
	expect(response.status()).toBe(400);
});
