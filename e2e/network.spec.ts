import { expect, test } from "@playwright/test";

import { deviceCall, signIn } from "./helpers";

interface WifiList {
	wifis: {
		wifi_name: string;
		is_paired: boolean;
		need_password: boolean;
		is_connected: boolean;
		is_auto_connect: boolean;
		signal_strength: number;
	}[];
}
interface WifiStatus {
	enabled: boolean;
	is_connected: boolean;
	connected_wifi_name: string;
}

const wifiList = (): Promise<WifiList> => deviceCall<WifiList>("wifi", "/api/v1/sys/wifi/wifi_list");
async function autoJoin(ssid: string): Promise<boolean | undefined> {
	const { wifis } = await wifiList();
	return wifis.find((wifi) => wifi.wifi_name === ssid)?.is_auto_connect;
}
// The device scans for networks to list them, which takes several seconds.
const SCAN = { timeout: 30_000 };
const wifiStatus = (): Promise<WifiStatus> => deviceCall<WifiStatus>("wifi", "/api/v1/sys/wifi/connection_status");

test("#11 Network shows the device's Wi-Fi state, networks and interfaces", async ({ page }) => {
	const status = await wifiStatus();
	const { wifis } = await wifiList();
	const { interfaces } = await deviceCall<{
		interfaces: { name: string; state: string; ipv4: { address: string }[] }[];
	}>("wifi", "/api/v1/sys/network");
	await signIn(page);
	await page.goto("/settings");
	const card = page.getByTestId("settings-network");

	if (status.is_connected)
		await expect(card.getByTestId("wifi-status")).toContainText(`Connected to ${status.connected_wifi_name}`);
	// Networks in range come and go between scans; saved ones are always listed.
	for (const wifi of wifis) {
		if (!wifi.is_paired) continue;
		await expect(card.getByTestId(`wifi-${wifi.wifi_name}`)).toBeVisible(SCAN);
	}
	for (const entry of interfaces) {
		const row = card.getByTestId(`interface-${entry.name}`);
		await expect(row).toContainText(entry.state);
		for (const address of entry.ipv4) await expect(row).toContainText(address.address);
	}
	await page.screenshot({ path: "test-results/settings-network.png", fullPage: true });
});

test("#11 turning Wi-Fi off or forgetting the network this app uses is refused", async ({ page }) => {
	const status = await wifiStatus();
	test.skip(!status.is_connected, "the device is not on Wi-Fi");
	await signIn(page);
	await page.goto("/settings");
	const card = page.getByTestId("settings-network");
	await expect(card.getByTestId("interface-wlan0")).toContainText("This app's link");
	await expect(card.getByRole("switch", { name: "Wi-Fi" })).toBeDisabled();
	await expect(
		card.getByTestId(`wifi-${status.connected_wifi_name}`).getByRole("button", { name: "Forget" })
	).toBeDisabled(SCAN);

	for (const body of [
		{ action: "radio", enabled: false },
		{ action: "forget", ssid: status.connected_wifi_name },
	]) {
		const response = await page.request.post("/api/settings/wifi", { data: body });
		expect(response.status(), JSON.stringify(body)).toBe(409);
	}
	const after = await wifiStatus();
	expect(after.is_connected).toBe(true);
	expect(after.connected_wifi_name).toBe(status.connected_wifi_name);
});

test("#11 Join warns before switching networks, and Cancel leaves the device where it is", async ({ page }) => {
	const status = await wifiStatus();
	const { wifis } = await wifiList();
	const other = wifis.find((wifi) => wifi.is_paired && !wifi.is_connected);
	test.skip(!other, "no saved network other than the current one");
	await signIn(page);
	await page.goto("/settings");
	const card = page.getByTestId("settings-network");
	await expect(
		card.getByTestId(`wifi-${status.connected_wifi_name}`).getByRole("button", { name: "Join" })
	).toHaveCount(0, SCAN);
	await card.getByTestId(`wifi-${other!.wifi_name}`).getByRole("button", { name: "Join" }).click(SCAN);
	const dialog = page.getByRole("dialog", { name: `Join ${other!.wifi_name}` });
	await expect(dialog).toContainText(`The device will leave its current network and join ${other!.wifi_name}.`);
	await expect(dialog.getByRole("button", { name: "Join" })).toBeVisible();
	await page.screenshot({ path: "test-results/wifi-join-warning.png" });
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toBeHidden();

	// A new network that needs a password gets the same warning in its password dialog.
	const stranger = wifis.find((wifi) => !wifi.is_paired && wifi.need_password);
	if (stranger) {
		await card.getByTestId(`wifi-${stranger.wifi_name}`).getByRole("button", { name: "Join" }).click(SCAN);
		const passwordDialog = page.getByRole("dialog", { name: `Join ${stranger.wifi_name}` });
		await expect(passwordDialog).toContainText(
			`The device will leave its current network and join ${stranger.wifi_name}.`
		);
		await expect(passwordDialog.getByLabel("Password")).toBeVisible();
		await expect(passwordDialog.getByRole("button", { name: "Join" })).toBeDisabled();
		await passwordDialog.getByRole("button", { name: "Cancel" }).click();
		await expect(passwordDialog).toBeHidden();
	}
	const after = await wifiStatus();
	expect(after.connected_wifi_name).toBe(status.connected_wifi_name);
});

// Really switches the device's Wi-Fi, which drops its link for a few seconds: set E2E_WIFI_SWITCH to a saved
// network on which the device keeps its address (e.g. the same LAN under another name).
const SWITCH_TO = process.env.E2E_WIFI_SWITCH;
test("#11 Join switches the device to another saved network, after the warning", async ({ page }) => {
	test.skip(!SWITCH_TO, "set E2E_WIFI_SWITCH to a saved network on the same LAN");
	const { connected_wifi_name: original } = await wifiStatus();
	expect(original, "the device must start on another network").not.toBe(SWITCH_TO);
	const join = async (ssid: string): Promise<void> => {
		const card = page.getByTestId("settings-network");
		await card.getByTestId(`wifi-${ssid}`).getByRole("button", { name: "Join" }).click(SCAN);
		await page
			.getByRole("dialog", { name: `Join ${ssid}` })
			.getByRole("button", { name: "Join" })
			.click();
		await expect(card.getByRole("alert").filter({ hasText: `Joining ${ssid}.` })).toBeVisible({ timeout: 120_000 });
		await expect
			.poll(
				async () => {
					const { connected_wifi_name: current } = await wifiStatus();
					return current;
				},
				{ timeout: 120_000 }
			)
			.toBe(ssid);
		await expect(card.getByTestId("wifi-status")).toContainText(`Connected to ${ssid}`, { timeout: 30_000 });
	};
	await signIn(page);
	await page.goto("/settings");
	try {
		await join(SWITCH_TO!);
		await join(original);
	} finally {
		const { connected_wifi_name: current } = await wifiStatus();
		if (current !== original) {
			await deviceCall("wifi", "/api/v1/sys/wifi/wifi_change", {
				method: "POST",
				body: { connected_wifi_name: original },
			});
		}
	}
});

test("#11 auto-join can be switched for a saved network", async ({ page }) => {
	const { wifis } = await wifiList();
	const saved = wifis.find((wifi) => wifi.is_paired && !wifi.is_connected);
	test.skip(!saved, "no saved network other than the current one");
	const original = saved!.is_auto_connect;
	await signIn(page);
	await page.goto("/settings");
	const toggle = page.getByRole("switch", { name: `Auto-join ${saved!.wifi_name}` });
	try {
		await expect(toggle).toBeChecked({ checked: original, ...SCAN });
		await toggle.click();
		await expect(
			page
				.getByTestId("settings-network")
				.getByRole("alert")
				.filter({ hasText: `Auto-join ${original ? "off" : "on"} for ${saved!.wifi_name}.` })
		).toBeVisible(SCAN);
		await expect.poll(() => autoJoin(saved!.wifi_name), SCAN).toBe(!original);
		await expect(toggle).toBeChecked({ checked: !original, ...SCAN });
		await toggle.click();
		await expect.poll(() => autoJoin(saved!.wifi_name), SCAN).toBe(original);
	} finally {
		await deviceCall("wifi", "/api/v1/sys/wifi/wifi_auto_connect", {
			method: "POST",
			body: { wifi_name: saved!.wifi_name, enabled: original },
		});
	}
});
