import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { devicePost, EMBEDDING_MODEL, isRunning, kbCall, signIn, vaultFiles } from "./helpers";

async function vaultNames(): Promise<string[]> {
	const files = await vaultFiles();
	return files.map((file) => file.filename);
}

const INDEXING = { timeout: 3 * 60_000 };

test("#15 a file goes into Vault, is indexed, found, downloaded, renamed and deleted", async ({ page }) => {
	test.setTimeout(10 * 60_000);
	const embeddingWasLoaded = await isRunning(EMBEDDING_MODEL);
	const stamp = Date.now().toString(36);
	const name = `vault-e2e-${stamp}.txt`;
	const renamed = `vault-e2e-${stamp}-renamed.txt`;
	const content = `Field notes ${stamp}. The lighthouse on Quarry Point is painted ultramarine and its keeper is named Odalys Brenner.`;

	await signIn(page);
	await page.getByRole("link", { name: "Vault" }).click();
	const card = page.getByTestId("vault-files");
	try {
		await page
			.getByLabel("Files to upload")
			.setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from(content) });
		await expect(page.getByTestId("vault-progress")).toBeVisible();
		await expect(card.getByRole("alert")).toHaveText(`${name} added to Vault.`, INDEXING);
		const row = card.getByTestId(`vault-file-${name}`);
		await expect(row).toContainText("Indexed");
		await expect(row).toContainText(`${content.length} B`);
		const afterUpload = await vaultFiles();
		const stored = afterUpload.find((file) => file.filename === name);
		expect(stored?.finalized).toBe(true);
		expect(stored?.size_bytes).toBe(content.length);

		await page.getByLabel("Search").fill("What colour is the lighthouse on Quarry Point painted?");
		await page.getByRole("button", { name: "Search" }).click();
		await expect(page.getByTestId("vault-result").filter({ hasText: name })).toContainText("ultramarine", {
			timeout: 60_000,
		});

		const [download] = await Promise.all([
			page.waitForEvent("download"),
			row.getByRole("link", { name: "Download" }).click(),
		]);
		expect(download.suggestedFilename()).toBe(name);
		const downloaded = await download.path();
		expect(await readFile(downloaded)).toEqual(Buffer.from(content));

		await row.getByRole("button", { name: "Rename" }).click();
		await page.getByRole("dialog").getByLabel("File name").fill(renamed);
		await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
		await expect(card.getByTestId(`vault-file-${renamed}`)).toBeVisible();
		await expect.poll(vaultNames).toContain(renamed);

		await card.getByTestId(`vault-file-${renamed}`).getByRole("button", { name: "Delete" }).click();
		await page.getByRole("dialog", { name: "Delete file?" }).getByRole("button", { name: "Delete" }).click();
		await expect(card.getByTestId(`vault-file-${renamed}`)).toHaveCount(0);
		const afterDelete = await vaultFiles();
		expect(afterDelete.some((file) => file.source_id === stored?.source_id)).toBe(false);
		await page.screenshot({ path: "test-results/vault.png", fullPage: true });
	} finally {
		for (const file of await vaultFiles()) {
			if (file.filename.startsWith(`vault-e2e-${stamp}`)) {
				await kbCall("/kb/delete-memory", { method: "POST", body: { source_id: file.source_id } });
			}
		}
		if (!embeddingWasLoaded && (await isRunning(EMBEDDING_MODEL))) {
			await devicePost(`/api/v1/models/${EMBEDDING_MODEL}/stop`);
		}
	}
});

test("#15 files Vault does not accept are refused before upload", async ({ page }) => {
	await signIn(page);
	await page.goto("/dashboard/vault");
	const response = await page.request.post("/api/vault/upload", {
		multipart: { files: { name: "program.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") } },
	});
	expect(response.status()).toBe(400);
	const body = (await response.json()) as { error: string };
	expect(body.error).toContain("Vault accepts");
});
