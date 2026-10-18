import { expect, test } from "@playwright/test";

import { CHAT_MODEL, deviceGet, kbCall, selectOption, signIn } from "./helpers";

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

test("#16 summary model and time are saved on the device", async ({ page }) => {
	const schedule = await kbCall<Schedule>("/kb/memory/schedule");
	const model = await kbCall<{ model_id: string }>("/kb/memory/model");
	const downloaded = await deviceGet<{ data: { model_id: string; display_name: string }[] }>(
		"/api/v1/models/?including_downloading=false"
	);
	const target = downloaded.data.find((entry) => entry.model_id === CHAT_MODEL)!;
	await openHistory(page);
	const card = page.getByTestId("vault-summary-settings");
	try {
		await selectOption(page, "Summary model", target.display_name);
		await card.getByLabel("Daily at").fill("02:30");
		await card.getByRole("button", { name: "Save" }).click();
		await expect(card.getByRole("alert")).toHaveText("Summary settings saved.");
		await expect(card.getByTestId("summary-state")).toHaveText("On");
		const saved = await kbCall<Schedule>("/kb/memory/schedule");
		expect([saved.nightly_start_hour, saved.nightly_start_minute]).toEqual([2, 30]);
		const savedModel = await kbCall<{ model_id: string; automatic_summary_enabled: boolean }>("/kb/memory/model");
		expect(savedModel).toMatchObject({ model_id: CHAT_MODEL, automatic_summary_enabled: true });

		await selectOption(page, "Summary model", "Off");
		await card.getByRole("button", { name: "Save" }).click();
		await expect(card.getByTestId("summary-state")).toHaveText("Off");
		const off = await kbCall<{ automatic_summary_enabled: boolean }>("/kb/memory/model");
		expect(off.automatic_summary_enabled).toBe(false);
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
	expect([restored.nightly_start_hour, restored.nightly_start_minute, restored.nightly_end_hour]).toEqual([
		schedule.nightly_start_hour,
		schedule.nightly_start_minute,
		schedule.nightly_end_hour,
	]);
});
