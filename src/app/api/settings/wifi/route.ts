import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { isWifiLink, networkOverview, wifiNetworks } from "@/server/network";
import { apiRoute } from "@/server/route";

import type { WifiAction } from "@/types/device";

interface ActionResult {
	success?: boolean;
	message?: string;
}

function parse(body: unknown): WifiAction {
	const value = body as Partial<Record<string, unknown>>;
	const ssid = typeof value.ssid === "string" && value.ssid.length > 0 ? value.ssid : null;
	switch (value.action) {
		case "auto-join": {
			if (ssid && typeof value.enabled === "boolean") return { action: "auto-join", ssid, enabled: value.enabled };
			break;
		}
		case "connect": {
			if (ssid) {
				return {
					action: "connect",
					ssid,
					...(typeof value.password === "string" && value.password ? { password: value.password } : {}),
				};
			}
			break;
		}
		case "forget": {
			if (ssid) return { action: "forget", ssid };
			break;
		}
		case "radio": {
			if (typeof value.enabled === "boolean") return { action: "radio", enabled: value.enabled };
			break;
		}
	}
	throw new DeviceError("Unknown Wi-Fi action", 400);
}

const LINK_MESSAGE =
	"This app reaches the device over Wi-Fi, so this change would cut it off. Make it from TiinyOS or with the device on a cable.";

export const GET = apiRoute(async () => NextResponse.json(await wifiNetworks()));

// Applies a Wi-Fi change on the device, refusing changes that would drop the link this app uses.
export const POST = apiRoute(async (request) => {
	const action = parse(await request.json().catch(() => ({})));
	const overview = await networkOverview();
	const current = overview.wifi.ssid;
	const dropsLink =
		isWifiLink(overview) &&
		((action.action === "radio" && !action.enabled) ||
			(action.action === "forget" && action.ssid === current) ||
			(action.action === "connect" && action.ssid !== current));
	if (dropsLink) throw new DeviceError(LINK_MESSAGE, 409);

	let result: ActionResult;
	switch (action.action) {
		case "auto-join": {
			result = await deviceJson<ActionResult>("/api/v1/sys/wifi/wifi_auto_connect", {
				method: "POST",
				service: "wifi",
				body: { wifi_name: action.ssid, enabled: action.enabled },
			});
			break;
		}
		case "connect": {
			const networks = await wifiNetworks();
			const known = networks.find((network) => network.ssid === action.ssid);
			result =
				known?.saved && !action.password
					? await deviceJson<ActionResult>("/api/v1/sys/wifi/wifi_change", {
							method: "POST",
							service: "wifi",
							body: { connected_wifi_name: action.ssid },
							slow: true,
						})
					: await deviceJson<ActionResult>("/api/v1/sys/wifi/wifi_connect", {
							method: "POST",
							service: "wifi",
							body: { wifi_name: action.ssid, password: action.password ?? "" },
							slow: true,
						});
			break;
		}
		case "forget": {
			result = await deviceJson<ActionResult>("/api/v1/sys/wifi/wifi_disconnect", {
				method: "POST",
				service: "wifi",
				body: { wifi_name: action.ssid, forget: true },
			});
			break;
		}
		case "radio": {
			result = await deviceJson<ActionResult>("/api/v1/sys/wifi/connection_switch", {
				method: "POST",
				service: "wifi",
				body: { enabled: action.enabled },
			});
			break;
		}
	}
	if (result.success === false) throw new DeviceError(result.message || "The device refused the change", 502);
	return NextResponse.json({ message: result.message ?? "Done" });
});
