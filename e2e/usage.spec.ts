import { expect, test } from "@playwright/test";
import dayjs from "dayjs";

import { CHAT_MODEL, deviceGet, forgetNewConversations, holdChatModel, selectOption, signIn } from "./helpers";

const conversations = forgetNewConversations();
test.beforeEach(conversations.before);
test.afterEach(conversations.after);

type Week = Record<string, Record<string, { total_tokens: number; request_count: number }>>;
type Apps = Record<string, { total_tokens: number }>;

const monday = dayjs()
	.subtract((dayjs().day() + 6) % 7, "day")
	.format("YYYY-MM-DD");
const week = (): Promise<Week> => deviceGet<Week>(`/api/v1/statistics/week_usage?start_date=${monday}`);
async function appTokens(app: string): Promise<number> {
	const usage = await apps();
	return usage[app]?.total_tokens ?? 0;
}
const apps = (): Promise<Apps> => deviceGet<Apps>(`/api/v1/statistics/app_week_usage?start_date=${monday}`);

test("#13 the overview shows this week's token usage as the device recorded it", async ({ page }) => {
	const days = await week();
	const byApp = await apps();
	await signIn(page);
	const card = page.getByTestId("token-usage");
	for (const date of Object.keys(days)) await expect(card.getByTestId(`usage-day-${date}`)).toBeAttached();
	await page.screenshot({ path: "test-results/usage-chart.png", fullPage: true });

	await card.getByRole("button", { name: "Show as table" }).click();
	for (const [date, models] of Object.entries(days)) {
		for (const [model, counts] of Object.entries(models)) {
			const row = card.getByTestId(`usage-row-${date}-${model}`);
			await expect(row).toContainText(counts.total_tokens.toLocaleString("en-US"));
			await expect(row).toContainText(counts.request_count.toLocaleString("en-US"));
		}
	}
	for (const [app, usage] of Object.entries(byApp)) {
		const name = app === "default" ? "API and other apps" : app;
		await expect(page.getByTestId(`app-usage-total-${name}`)).toHaveText(usage.total_tokens.toLocaleString("en-US"));
	}
});

test("#13 a chat from this app is counted for this app and its model", async ({ page }) => {
	test.setTimeout(10 * 60_000);
	const model = await holdChatModel();
	try {
		const before = await apps();
		const beforeTokens = before["Tiiny Web"]?.total_tokens ?? 0;

		await signIn(page);
		await page.getByRole("link", { name: "Chat" }).click();
		await selectOption(page, "Model", model.name);
		await page.getByRole("textbox", { name: "Message" }).fill("Reply with the single word: counted");
		await page.getByRole("button", { name: "Send" }).click();
		await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 5 * 60_000 });

		await expect.poll(() => appTokens("Tiiny Web"), { timeout: 30_000 }).toBeGreaterThan(beforeTokens);
		const after = await apps();
		await page.getByRole("link", { name: "Overview" }).click();
		await expect(page.getByTestId("app-usage-total-Tiiny Web")).toHaveText(
			after["Tiiny Web"].total_tokens.toLocaleString("en-US"),
			{ timeout: 15_000 }
		);
		await expect(page.getByTestId("app-usage-Tiiny Web")).toContainText(CHAT_MODEL);
	} finally {
		await model.release();
	}
});
