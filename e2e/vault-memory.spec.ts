import { expect, test } from "@playwright/test";

import { kbCall, signIn } from "./helpers";

interface Schedule {
	nightly_start_hour: number;
	nightly_start_minute: number;
	nightly_end_hour: number | null;
	nightly_end_minute: number | null;
}

async function openHistory(page: import("@playwright/test").Page): Promise<void> {
	await signIn(page);
	await page.getByRole("link", { name: "Vault" }).click();
	await page.getByRole("tab", { name: "Chat history" }).click();
}

test("#16 the device's daily chat summaries are listed and readable", async ({ page }) => {
	const list = await kbCall<{ items: { source_id: string; filename: string }[] }>(
		"/kb/sources/conversations?limit=100&offset=0"
	);
	test.skip(list.items.length === 0, "the device has no chat summaries yet");
	await openHistory(page);
	for (const item of list.items) {
		await expect(page.getByTestId(`summary-${item.filename.replace(/\.txt$/, "")}`)).toBeVisible();
	}
	const first = list.items[0];
	const day = first.filename.replace(/\.txt$/, "");
	const text = await kbCall<string>(`/kb/files/${encodeURIComponent(first.source_id)}`, { text: true });
	const entry = page.getByTestId(`summary-${day}`);
	await entry.getByRole("button", { name: "Read" }).click();
	const shown = entry.getByTestId("summary-text");
	await expect(shown).toBeVisible();
	const shownText = await shown.textContent();
	expect(shownText?.trim()).toBe(text.trim());

	await entry.getByRole("button", { name: "Delete" }).click();
	await page.getByRole("dialog", { name: "Delete summary?" }).getByRole("button", { name: "Cancel" }).click();
	const after = await kbCall<{ items: { source_id: string }[] }>("/kb/sources/conversations?limit=100&offset=0");
	expect(after.items.map((item) => item.source_id)).toContain(first.source_id);
	await page.screenshot({ path: "test-results/vault-history.png", fullPage: true });
});

test("#16 daily summaries are switched on and off and timed on the History page, in local time", async ({ page }) => {
	const schedule = await kbCall<Schedule>("/kb/memory/schedule");
	const model = await kbCall<{ model_id: string }>("/kb/memory/model");
	const context = await kbCall<{ created_at: string }>("/kb/user-context");
	const match = /([+-])(\d{2}):(\d{2})$/.exec(context.created_at)!;
	const deviceOffset = (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
	// 03:00 here is this many minutes past midnight on the device's clock.
	const localOffset = -new Date().getTimezoneOffset();
	const expected = (((3 * 60 + deviceOffset - localOffset) % 1440) + 1440) % 1440;

	await signIn(page);
	await page.getByRole("link", { name: "History" }).click();
	const card = page.getByTestId("summary-settings");
	const toggle = card.getByRole("switch", { name: "Daily summaries" });
	try {
		await expect(toggle).toBeChecked({ checked: model.model_id !== "" });
		if (model.model_id !== "") {
			await toggle.click();
			await card.getByRole("button", { name: "Save" }).click();
			await expect(card.getByRole("alert")).toHaveText("Daily summaries off.");
			const off = await kbCall<{ model_id: string; automatic_summary_enabled: boolean }>("/kb/memory/model");
			expect(off.automatic_summary_enabled).toBe(false);
		}
		await toggle.click();
		await card.getByLabel("Time").fill("03:00");
		await expect(card).toContainText(
			`${String(Math.floor(expected / 60)).padStart(2, "0")}:${String(expected % 60).padStart(2, "0")} on the device`
		);
		await card.getByRole("button", { name: "Save" }).click();
		await expect(card.getByRole("alert")).toHaveText("Daily summaries on, at 03:00.");
		const saved = await kbCall<Schedule>("/kb/memory/schedule");
		expect(saved.nightly_start_hour * 60 + saved.nightly_start_minute).toBe(expected);
		const on = await kbCall<{ model_id: string; automatic_summary_enabled: boolean }>("/kb/memory/model");
		expect(on.automatic_summary_enabled).toBe(true);
		expect(on.model_id).not.toBe("");
		await page.reload();
		await expect(card.getByLabel("Time")).toHaveValue("03:00");
		await page.screenshot({ path: "test-results/history-summaries.png", fullPage: true });
	} finally {
		await kbCall("/kb/memory/schedule", {
			method: "PUT",
			body: {
				nightly_start_hour: schedule.nightly_start_hour,
				nightly_start_minute: schedule.nightly_start_minute,
				nightly_end_hour: schedule.nightly_end_hour,
				nightly_end_minute: schedule.nightly_end_minute,
			},
		});
		await kbCall("/kb/memory/model", { method: "PUT", body: { model_id: model.model_id } });
	}
	const restored = await kbCall<Schedule>("/kb/memory/schedule");
	expect([restored.nightly_start_hour, restored.nightly_start_minute]).toEqual([
		schedule.nightly_start_hour,
		schedule.nightly_start_minute,
	]);
	const restoredModel = await kbCall<{ model_id: string }>("/kb/memory/model");
	expect(restoredModel.model_id).toBe(model.model_id);
});
