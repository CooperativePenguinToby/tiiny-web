import { expect, test } from "@playwright/test";

import { deviceCall, signIn } from "./helpers";

interface WifiList {
	wifis: {
		wifi_name: string;
		is_paired: boolean;
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
	await page.goto("/dashboard/settings");
	const card = page.getByTestId("settings-network");

	if (status.is_connected)
		await expect(card.getByTestId("wifi-status")).toContainText(`Connected to ${status.connected_wifi_name}`);
	// Networks in range come and go between scans; saved ones are always listed.
	for (const wifi of wifis.filter((entry) => entry.is_paired)) {
		await expect(card.getByTestId(`wifi-${wifi.wifi_name}`)).toBeVisible(SCAN);
	}
	for (const entry of interfaces) {
		const row = card.getByTestId(`interface-${entry.name}`);
		await expect(row).toContainText(entry.state);
		for (const address of entry.ipv4) await expect(row).toContainText(address.address);
	}
	await page.screenshot({ path: "test-results/settings-network.png", fullPage: true });
});

test("#11 changes that would cut this app off from the device are refused", async ({ page }) => {
	const status = await wifiStatus();
	test.skip(!status.is_connected, "the device is not on Wi-Fi");
	await signIn(page);
	await page.goto("/dashboard/settings");
	const card = page.getByTestId("settings-network");
	await expect(card.getByTestId("interface-wlan0")).toContainText("This app's link");
	await expect(card.getByRole("checkbox", { name: "Wi-Fi" })).toBeDisabled();
	await expect(
		card.getByTestId(`wifi-${status.connected_wifi_name}`).getByRole("button", { name: "Forget" })
	).toBeDisabled(SCAN);
	await expect(card.getByRole("button", { name: "Join" })).toHaveCount(0);

	for (const body of [
		{ action: "radio", enabled: false },
		{ action: "forget", ssid: status.connected_wifi_name },
		{ action: "connect", ssid: "some-other-network", password: "x" },
	]) {
		const response = await page.request.post("/api/settings/wifi", { data: body });
		expect(response.status(), JSON.stringify(body)).toBe(409);
	}
	const after = await wifiStatus();
	expect(after.is_connected).toBe(true);
	expect(after.connected_wifi_name).toBe(status.connected_wifi_name);
});

test("#11 auto-join can be switched for a saved network", async ({ page }) => {
	const { wifis } = await wifiList();
	const saved = wifis.find((wifi) => wifi.is_paired && !wifi.is_connected);
	test.skip(!saved, "no saved network other than the current one");
	const original = saved!.is_auto_connect;
	await signIn(page);
	await page.goto("/dashboard/settings");
	const toggle = page.getByRole("checkbox", { name: `Auto-join ${saved!.wifi_name}` });
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
