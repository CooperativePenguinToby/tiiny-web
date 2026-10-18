import { expect, test, type Page } from "@playwright/test";

import {
	CHAT_MODEL,
	conversationIds,
	historyCall,
	holdChatModel,
	selectOption,
	signIn,
	storedMessages,
} from "./helpers";

const REPLY = { timeout: 5 * 60_000 };
const lastReply = (page: Page) => page.getByTestId("message-assistant").last().getByTestId("message-content");

async function send(page: Page, text: string): Promise<void> {
	await page.getByRole("textbox", { name: "Message" }).fill(text);
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Send" })).toBeVisible(REPLY);
}

test("#17 + xflow E: a chat is kept in the device's history, found, reopened, continued and deleted", async ({
	page,
}) => {
	test.setTimeout(10 * 60_000);
	const model = await holdChatModel();
	const stamp = `kestrel${Date.now().toString(36)}`;
	const first = `Remember the word ${stamp}. Reply with one short sentence.`;
	const second = "Now reply with exactly the single word: done";
	let conversationId: string | null = null;
	try {
		await signIn(page);
		await page.getByRole("link", { name: "Chat" }).click();
		await selectOption(page, "Model", model.name);
		await send(page, first);
		await expect(page).toHaveURL(/[?&]c=[\w-]+/);
		conversationId = new URL(page.url()).searchParams.get("c");
		const firstReplyText = await lastReply(page).textContent();
		const firstReply = firstReplyText?.trim() ?? "";
		expect(firstReply.length).toBeGreaterThan(0);

		const stored = await storedMessages(conversationId!);
		expect(stored.map((message) => [message.role, message.text.trim()])).toEqual([
			["user", first],
			["assistant", firstReply],
		]);
		expect(stored.every((message) => message.model_id === CHAT_MODEL && message.status === "success")).toBe(true);
		const conversation = await historyCall<{ title: string }>(`/conversations/${conversationId}`);
		expect(conversation.title).toBe(`${first.slice(0, 50)}...`);

		await page.getByRole("link", { name: "History" }).click();
		const row = page.getByTestId(`conversation-${conversationId}`);
		await expect(row).toContainText(conversation.title);
		await page.getByLabel("Search conversations").fill(stamp);
		await page.getByRole("button", { name: "Search" }).click();
		await expect(page.locator('[data-testid^="conversation-"]')).toHaveCount(1, { timeout: 60_000 });
		await expect(row).toContainText(stamp);

		await row.getByRole("link").click();
		await expect(page).toHaveURL(new RegExp(`c=${conversationId}`));
		await expect(page.getByTestId("message-user").first()).toContainText(stamp);
		await expect(lastReply(page)).toHaveText(firstReply);
		await selectOption(page, "Model", model.name);
		await send(page, second);
		await expect(page).toHaveURL(new RegExp(`c=${conversationId}`));
		const continued = await storedMessages(conversationId!);
		expect(continued.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant"]);
		expect(continued[2].text.trim()).toBe(second);
		await page.screenshot({ path: "test-results/history-continued.png", fullPage: true });

		await page.getByRole("link", { name: "History" }).click();
		await page.getByTestId(`conversation-${conversationId}`).getByRole("button", { name: "Delete" }).click();
		await page.getByRole("dialog", { name: "Delete conversation?" }).getByRole("button", { name: "Delete" }).click();
		await expect(page.getByTestId(`conversation-${conversationId}`)).toHaveCount(0);
		expect(await conversationIds()).not.toContain(conversationId);
		conversationId = null;
	} finally {
		if (conversationId) await historyCall(`/conversations/${conversationId}`, { method: "DELETE" });
		await model.release();
	}
});

test("#17 a stopped reply is kept as stopped", async ({ page }) => {
	test.setTimeout(10 * 60_000);
	const model = await holdChatModel();
	let conversationId: string | null = null;
	try {
		await signIn(page);
		await page.getByRole("link", { name: "Chat" }).click();
		await selectOption(page, "Model", model.name);
		await page.getByRole("textbox", { name: "Message" }).fill("Count from 1 to 300, one number per line.");
		await page.getByRole("button", { name: "Send" }).click();
		await expect(lastReply(page)).toContainText("5", REPLY);
		await page.getByRole("button", { name: "Stop" }).click();
		await expect(page).toHaveURL(/[?&]c=[\w-]+/);
		conversationId = new URL(page.url()).searchParams.get("c");
		const stored = await storedMessages(conversationId!);
		expect(stored[1]).toMatchObject({ role: "assistant", status: "paused" });
		await page.reload();
		await expect(page.getByTestId("message-assistant").last()).toContainText("Stopped.");
	} finally {
		if (conversationId) await historyCall(`/conversations/${conversationId}`, { method: "DELETE" });
		await model.release();
	}
});
