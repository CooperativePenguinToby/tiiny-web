import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { readZip } from "../src/server/zip";
import { conversationIds, deviceCall, signIn } from "./helpers";

async function serial(): Promise<string> {
	const connect = await deviceCall<{ device_id: string }>("auth", "/api/v1/connect", { method: "POST", body: {} });
	return connect.device_id;
}

test("#25 a backup is downloaded and chat history is restored from it", async ({ page }) => {
	test.setTimeout(10 * 60_000);
	const device = await serial();
	const ids = await conversationIds();
	const before = ids.toSorted();
	await signIn(page);
	await page.goto("/dashboard/settings");
	const card = page.getByTestId("settings-backup");
	await expect(card.getByRole("checkbox", { name: /^Chat history/ })).toBeChecked({ timeout: 30_000 });
	await expect(card.getByRole("checkbox", { name: /^Vault & personalization/ })).toBeChecked();

	const [download] = await Promise.all([
		page.waitForEvent("download"),
		card.getByRole("button", { name: "Download backup" }).click(),
	]);
	expect(download.suggestedFilename()).toMatch(/^tiiny\.\d{12}\.zip$/);
	const file = await download.path();
	const archive = await readFile(file);
	const entries = readZip(archive);
	expect(entries.map((entry) => entry.name)).toEqual(
		expect.arrayContaining([
			"tiiny-backup/conversation-service.zip",
			"tiiny-backup/knowledge-base.zip",
			"metadata.json",
		])
	);
	const metadata = JSON.parse(
		entries
			.find((entry) => entry.name === "metadata.json")!
			.read()
			.toString("utf8")
	) as {
		device_id: string;
	};
	expect(metadata.device_id).toBe(device);
	await expect(card.getByRole("alert")).toContainText(/^Saved tiiny\.\d{12}\.zip/);

	const restore = card.getByTestId("restore-section");
	await restore.getByLabel("Backup file").setInputFiles(file);
	await restore.getByRole("checkbox", { name: /^Vault/ }).uncheck();
	await expect(restore.getByRole("checkbox", { name: "Chat history" })).toBeChecked();
	await restore.getByRole("button", { name: "Restore" }).click();
	const dialog = page.getByRole("dialog", { name: "Restore backup?" });
	await expect(dialog).toContainText("Chat history");
	await expect(dialog).not.toContainText("Vault");
	await dialog.getByRole("button", { name: "Restore" }).click();
	await expect(card.getByTestId("restore-results")).toContainText("Chat history", { timeout: 5 * 60_000 });
	await expect(card.getByTestId("restore-results").getByRole("alert").filter({ hasText: "Chat history" })).toHaveClass(
		/MuiAlert-.*[Ss]uccess/
	);
	await page.screenshot({ path: "test-results/backup.png", fullPage: true });
	const idsAfter = await conversationIds();
	const after = idsAfter.toSorted();
	expect(after).toEqual(before);
});

test("#25 a backup from another device is refused", async ({ page }) => {
	await signIn(page);
	const response = await page.request.post("/api/backup/download", { data: { services: ["conversation-service"] } });
	expect(response.ok()).toBe(true);
	const device = await serial();
	// Same length, different serial; the reader does not check checksums.
	const other = `${device.slice(0, -4)}0000` === device ? `${device.slice(0, -4)}1111` : `${device.slice(0, -4)}0000`;
	const original = await response.body();
	const forged = Buffer.from(original.toString("latin1").replaceAll(device, other), "latin1");
	await page.goto("/dashboard/settings");
	const card = page.getByTestId("settings-backup");
	await card
		.getByLabel("Backup file")
		.setInputFiles({ name: "other.zip", mimeType: "application/zip", buffer: forged });
	await expect(card.getByRole("alert").filter({ hasText: "made on another device" })).toBeVisible({ timeout: 30_000 });
	await expect(card.getByRole("button", { name: "Restore" })).toHaveCount(0);
	const direct = await page.request.post("/api/backup/restore", {
		multipart: {
			file: { name: "other.zip", mimeType: "application/zip", buffer: forged },
			services: JSON.stringify(["conversation-service"]),
		},
	});
	expect(direct.status()).toBe(400);
});
