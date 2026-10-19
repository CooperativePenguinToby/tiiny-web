import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { isWifiLink, networkOverview, wifiNetworks } from "@/server/network";
import { apiRoute } from "@/server/route";

import type { WifiAction } from "@/types/device";
import { getT } from "@/i18n/server";

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
					...(typeof value.password === "string" && value.password && { password: value.password }),
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
	throw new DeviceError("errors.wifi.unknownAction", 400);
}

export const GET = apiRoute(async () => NextResponse.json(await wifiNetworks()));

// Applies a Wi-Fi change on the device, refusing changes that would drop the link this app uses.
export const POST = apiRoute(async (request) => {
	let body: unknown = {};
	try {
		body = await request.json();
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const action = parse(body);
	const overview = await networkOverview();
	const current = overview.wifi.ssid;
	const dropsLink =
		isWifiLink(overview) &&
		((action.action === "radio" && !action.enabled) ||
			(action.action === "forget" && action.ssid === current) ||
			(action.action === "connect" && action.ssid !== current));
	if (dropsLink) throw new DeviceError("errors.wifi.wouldDropLink", 409);

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
	if (result.success === false) {
		throw result.message
			? new DeviceError("errors.passthrough", 502, { message: result.message })
			: new DeviceError("errors.device.refusedChange", 502);
	}
	const t = await getT();
	return NextResponse.json({ message: result.message ?? t("server.done") });
});
