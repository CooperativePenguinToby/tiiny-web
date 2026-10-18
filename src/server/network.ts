import type { NetworkOverview, WifiNetwork } from "@/types/device";

import { deviceJson } from "./device";
import { resolveDeviceTarget } from "./shared/device-target.mjs";

interface WifiStatus {
	enabled: boolean;
	is_connected: boolean;
	connected_wifi_name: string | null;
	signal_strength: number | null;
	error: string | null;
}
interface WifiList {
	wifis: {
		wifi_name: string;
		signal_strength: number;
		need_password: boolean;
		is_paired: boolean;
		is_auto_connect: boolean;
		is_connected: boolean;
		is_connecting: boolean;
	}[];
}
interface Interfaces {
	interfaces: {
		name: string;
		state: string;
		ipv4: { address: string }[];
		ipv6: { address: string }[];
		ipv6_local: { address: string }[];
	}[];
}

export async function networkOverview(): Promise<NetworkOverview> {
	const [status, network] = await Promise.all([
		deviceJson<WifiStatus>("/api/v1/sys/wifi/connection_status", { service: "wifi" }),
		deviceJson<Interfaces>("/api/v1/sys/network", { service: "wifi" }),
	]);
	const target = resolveDeviceTarget();
	const deviceHost = target ? new URL(target.baseUrl).hostname.replaceAll(/^\[|\]$/g, "") : null;
	const interfaces = network.interfaces.map((entry) => ({
		name: entry.name,
		state: entry.state,
		addresses: [...entry.ipv4, ...entry.ipv6, ...entry.ipv6_local].map((address) => address.address),
	}));
	return {
		wifi: {
			enabled: status.enabled,
			connected: status.is_connected,
			ssid: status.connected_wifi_name || null,
			signal: status.is_connected ? status.signal_strength : null,
			error: status.error,
		},
		interfaces,
		linkInterface:
			interfaces.find((entry) => deviceHost !== null && entry.addresses.includes(deviceHost))?.name ?? null,
	};
}

// Networks in range plus saved ones. The device scans to answer, which takes a few seconds.
export async function wifiNetworks(): Promise<WifiNetwork[]> {
	const list = await deviceJson<WifiList>("/api/v1/sys/wifi/wifi_list", { service: "wifi", slow: true });
	return list.wifis.map((wifi) => ({
		ssid: wifi.wifi_name,
		signal: wifi.signal_strength,
		needsPassword: wifi.need_password,
		saved: wifi.is_paired,
		autoJoin: wifi.is_auto_connect,
		connected: wifi.is_connected,
		connecting: wifi.is_connecting,
	}));
}

// Wi-Fi interfaces are named wlan*; changing Wi-Fi while this app reaches the device over it would cut the app off.
export const isWifiLink = (overview: NetworkOverview): boolean => overview.linkInterface?.startsWith("wlan") ?? false;
