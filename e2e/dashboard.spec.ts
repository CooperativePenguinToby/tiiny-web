import { expect, test } from "@playwright/test";

import { deviceGet, runningModelIds, signIn } from "./helpers";

test("wrong password is rejected and the dashboard stays locked", async ({ page }) => {
	await page.goto("/auth/sign-in");
	await page.getByRole("textbox", { name: "Password" }).fill("definitely-not-the-password");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByText("Incorrect password")).toBeVisible();
	await page.goto("/dashboard");
	await expect(page).toHaveURL(/\/auth\/sign-in$/);
});

test("#1 dashboard shows live device stats and the models running on the device", async ({ page }) => {
	await signIn(page);

	const storage = await deviceGet<{ total_bytes: number; used_bytes: number }>("/api/v1/sys/storage");
	const info = await deviceGet<{ device_model_name: string; tiiny_os: string }>("/api/v1/sys/device_info");
	await expect(page.getByText(`${info.device_model_name} · TiinyOS ${info.tiiny_os}`)).toBeVisible();

	for (const title of ["NPU utilization", "NPU memory", "System memory", "Storage"]) {
		await expect(page.getByTestId(`stat-${title}`)).toContainText(/\d+%/);
	}
	const storagePercent = Math.round((storage.used_bytes / storage.total_bytes) * 100);
	await expect(page.getByTestId("stat-Storage")).toContainText(`${storagePercent}%`);

	const running = await runningModelIds();
	for (const modelId of running) {
		await expect(page.getByTestId(`running-${modelId}`)).toContainText(modelId);
	}
	await expect(page.getByRole("table", { name: "Loaded models" }).locator("tbody tr")).toHaveCount(running.length);

	await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });

	await page.getByRole("button", { name: "Sign out" }).click();
	await expect(page).toHaveURL(/\/auth\/sign-in$/);
	await page.goto("/dashboard");
	await expect(page).toHaveURL(/\/auth\/sign-in$/);
});
