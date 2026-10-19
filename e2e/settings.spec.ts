import { expect, test } from "@playwright/test";

import { formatBytes } from "../src/lib/format";
import { deviceApiKey, deviceBaseUrl, deviceCall, deviceGet, signIn } from "./helpers";

interface Connect {
	device_id: string;
	user_info: { device_name: string };
}

const connect = (): Promise<Connect> => deviceCall<Connect>("auth", "/api/v1/connect", { method: "POST", body: {} });

test("#10 Settings shows the device's own information", async ({ page }) => {
	const info = await deviceGet<Record<string, string>>("/api/v1/sys/device_info");
	const { device_id: serial, user_info } = await connect();
	await signIn(page);
	await page.getByRole("link", { name: "Settings" }).click();

	const card = page.getByTestId("settings-device");
	await expect(card.getByTestId("device-name")).toHaveText(user_info.device_name);
	await expect(card.getByTestId("device-serial")).toHaveText(serial);
	await expect(card.getByTestId("device-model")).toHaveText(`${info.device_model_name} (${info.device_model_date})`);
	await expect(card.getByTestId("device-os")).toHaveText(info.tiiny_os);
	await expect(card.getByTestId("device-spec-RAM")).toHaveText(info.ram);
	await expect(card.getByTestId("device-spec-Peak INT8")).toHaveText(info.peak_int8);
	await page.screenshot({ path: "test-results/settings.png", fullPage: true });
});

test("#10 renaming the device changes its name on the device", async ({ page }) => {
	const { user_info: originalInfo } = await connect();
	const original = originalInfo.device_name;
	const name = `e2e ${Date.now().toString(36)}`;
	await signIn(page);
	await page.goto("/settings");
	const card = page.getByTestId("settings-device");
	try {
		await card.getByRole("button", { name: "Rename" }).click();
		await card.getByLabel("Device name").fill(name);
		await card.getByRole("button", { name: "Save" }).click();
		await expect(card.getByTestId("device-name")).toHaveText(name);
		const stored = await deviceCall<{ device_name: string }>("auth", "/api/v1/account/device_name");
		expect(stored.device_name).toBe(name);

		await card.getByRole("button", { name: "Rename" }).click();
		await card.getByLabel("Device name").fill(original);
		await card.getByRole("button", { name: "Save" }).click();
		await expect(card.getByTestId("device-name")).toHaveText(original);
	} finally {
		await deviceCall("auth", "/api/v1/account/device_name", { method: "POST", body: { device_name: original } });
	}
	const restored = await deviceCall<{ device_name: string }>("auth", "/api/v1/account/device_name");
	expect(restored.device_name).toBe(original);
});

test("#10 storage matches the device, and deleting asks first", async ({ page }) => {
	const storage = await deviceGet<{
		used_bytes: number;
		total_bytes: number;
		details: { name: string; size_bytes: number }[];
	}>("/api/v1/sys/storage");
	const models = await deviceGet<{ data: { models: { model_id: string; size_bytes: number }[] } }>(
		"/api/v1/models/storage"
	);
	const agents = await deviceGet<{ apps: { name: string; size_bytes: number }[] }>("/api/v1/sys/storage/agent");
	await signIn(page);
	await page.goto("/settings");
	const card = page.getByTestId("settings-storage");

	await expect(card.getByTestId("storage-used")).toHaveText(
		`${formatBytes(storage.used_bytes)} of ${formatBytes(storage.total_bytes)} used`
	);
	for (const detail of storage.details) {
		await expect(card.getByTestId(`storage-category-${detail.name}`)).toHaveText(
			`${detail.name}: ${formatBytes(detail.size_bytes)}`
		);
	}
	for (const model of models.data.models) {
		await expect(card.getByTestId(`storage-model-${model.model_id}`)).toContainText(formatBytes(model.size_bytes));
	}
	await expect(card.getByTestId("storage-model-Qwen/Qwen3-Embedding-0.6B")).toContainText("Used by Vault");
	for (const app of agents.apps) {
		const serviceId = app.name.replace(/^wa-/, "");
		await expect(card.getByTestId(`storage-agent-${serviceId}`)).toContainText(formatBytes(app.size_bytes));
	}

	const agentId = agents.apps[0].name.replace(/^wa-/, "");
	await card.getByTestId(`storage-agent-${agentId}`).getByRole("button", { name: "Delete" }).click();
	const dialog = page.getByRole("dialog", { name: "Delete agent?" });
	await expect(dialog).toContainText(agentId);
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toBeHidden();
	const after = await deviceGet<{ apps: { name: string }[] }>("/api/v1/sys/storage/agent");
	expect(after.apps.map((app) => app.name)).toContain(agents.apps[0].name);
});

test("#10 API access shows LAN base URLs and reveals the device key only on request", async ({ page }) => {
	await signIn(page);
	await page.goto("/settings");
	const card = page.getByTestId("settings-api");
	await expect(card.getByTestId("api-base-OpenAI-compatible")).toHaveText(`${deviceBaseUrl()}/v1`);
	await expect(card.getByTestId("api-base-Ollama")).toHaveText(deviceBaseUrl());
	expect(await page.content()).not.toContain(deviceApiKey());

	await card.getByRole("button", { name: "Reveal" }).click();
	await expect(card.getByTestId("api-key")).toHaveText(deviceApiKey());

	// The advertised base URL really serves the models with that key.
	const models = await fetch(`${deviceBaseUrl()}/v1/models`, {
		headers: { Authorization: `Bearer ${deviceApiKey()}` },
	});
	expect(models.ok).toBe(true);
});
