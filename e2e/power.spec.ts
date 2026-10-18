import { expect, test } from "@playwright/test";

import { deviceCall, deviceGet, signIn } from "./helpers";

const setAutoPowerOn = (enabled: boolean): Promise<unknown> =>
	deviceCall("main", "/api/v1/sys/ac_power/", { method: "POST", body: { switch: enabled ? 1 : 0 } });

// The device confirms Auto power-on changes but always reads the setting back as off, so the device's own
// confirmation is the evidence.
test("#12 Auto power-on is switched on and off on the device", async ({ page }) => {
	await signIn(page);
	await page.goto("/dashboard/settings");
	const card = page.getByTestId("settings-power");
	try {
		await card.getByRole("button", { name: "Turn on" }).click();
		await expect(card.getByRole("alert")).toHaveText("Device: AC power recovery enabled successfully", {
			timeout: 30_000,
		});
		await card.getByRole("button", { name: "Turn off" }).click();
		await expect(card.getByRole("alert")).toHaveText("Device: AC power recovery disabled successfully", {
			timeout: 30_000,
		});
	} finally {
		await setAutoPowerOn(false);
	}
});

test("#12 checking for updates shows what the device's upgrade service reports", async ({ page }) => {
	await signIn(page);
	await page.goto("/dashboard/settings");
	const card = page.getByTestId("settings-power");
	await card.getByRole("button", { name: "Check for updates" }).click();
	const { data } = await deviceCall<{
		data: { current_version: string; available_version: string; update_available: boolean };
	}>("upgrade", "/api/upgrade/check", { method: "POST" });
	await expect(card.getByTestId("update-status")).toHaveText(
		`TiinyOS ${data.current_version} · ${data.update_available ? `version ${data.available_version} is available` : "up to date"}`,
		{ timeout: 60_000 }
	);
	await expect(card.getByRole("button", { name: "Download update" })).toHaveCount(data.update_available ? 1 : 0);
	await page.screenshot({ path: "test-results/settings-power.png", fullPage: true });
});

test("#12 shutting down asks first; cancelling leaves the device on", async ({ page }) => {
	await signIn(page);
	await page.goto("/dashboard/settings");
	await page.getByTestId("settings-power").getByRole("button", { name: "Shut down" }).click();
	const dialog = page.getByRole("dialog", { name: "Shut down the device?" });
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toBeHidden();
	await page.waitForTimeout(3000);
	await deviceGet("/api/v1/sys/status");
});

// Restarts the real device (models unload, agents restart), so it runs only when asked for.
test("#12 Restart reboots the device and the page follows it back", async ({ page }) => {
	test.skip(!process.env.E2E_REBOOT, "set E2E_REBOOT=1 to restart the device");
	test.setTimeout(15 * 60_000);
	await signIn(page);
	await page.goto("/dashboard/settings");
	const card = page.getByTestId("settings-power");
	await card.getByRole("button", { name: "Restart" }).click();
	await page.getByRole("dialog", { name: "Restart the device?" }).getByRole("button", { name: "Restart" }).click();
	await expect(card.getByRole("alert")).toContainText("Restarting");

	// Independent of the page: the device must really go away, then answer again.
	let wentDown = false;
	await expect
		.poll(
			async () => {
				try {
					await deviceGet("/api/v1/sys/status");
					return wentDown ? "back" : "up";
				} catch {
					wentDown = true;
					return "down";
				}
			},
			{ timeout: 12 * 60_000, intervals: [2000] }
		)
		.toBe("back");
	await expect(card.getByRole("alert")).toContainText("The device is back.", { timeout: 5 * 60_000 });
	await page.screenshot({ path: "test-results/settings-restarted.png", fullPage: true });
});
