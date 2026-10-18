import { expect, test } from "@playwright/test";

import { deviceCall, signIn } from "./helpers";

interface Profile {
	user_name: string;
	occupation: string;
	preferences: string;
	more_about_you: string;
}

async function profile(): Promise<Profile> {
	const context = await deviceCall<{ profile: Profile }>("kb", "/kb/user-context");
	return context.profile;
}

test("#14 personalization edits are stored on the device", async ({ page }) => {
	const original = await profile();
	const stamp = Date.now().toString(36);
	const edited = {
		occupation: `lighthouse keeper ${stamp}`,
		preferences: `${original.preferences}\nAnswers in haiku when asked (${stamp}).`.trim(),
		recentFocus: `testing tiiny web ${stamp}`,
	};
	await signIn(page);
	await page.goto("/dashboard/settings");
	const card = page.getByTestId("settings-personalization");
	try {
		await expect(card.getByLabel("Occupation")).toHaveValue(original.occupation);
		await expect(card.getByLabel("Preferences")).toHaveValue(original.preferences);
		await card.getByLabel("Occupation").fill(edited.occupation);
		await card.getByLabel("Preferences").fill(edited.preferences);
		await card.getByLabel("Recent focus").fill(edited.recentFocus);
		await card.getByRole("button", { name: "Save" }).click();
		await expect(card.getByRole("alert")).toContainText("Saved.");

		const stored = await profile();
		expect(stored.occupation).toBe(edited.occupation);
		expect(stored.preferences).toBe(edited.preferences);
		expect(stored.more_about_you).toBe(edited.recentFocus);
		expect(stored.user_name).toBe(original.user_name);

		await page.reload();
		await expect(card.getByLabel("Occupation")).toHaveValue(edited.occupation);
		await expect(card.getByLabel("Recent focus")).toHaveValue(edited.recentFocus);

		await card.getByLabel("Occupation").fill("x".repeat(51));
		await expect(card.getByRole("button", { name: "Save" })).toBeDisabled();
		await card.getByRole("button", { name: "Discard changes" }).click();
		await expect(card.getByLabel("Occupation")).toHaveValue(edited.occupation);
		await page.screenshot({ path: "test-results/personalization.png", fullPage: true });
	} finally {
		await deviceCall("kb", "/kb/user-context/profile", { method: "PUT", body: original });
	}
	const restored = await profile();
	expect(restored).toEqual(original);
});
