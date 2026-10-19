import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

import { getT } from "@/i18n/server";

// "Auto Power-on" in TiinyOS: the device turns on by itself when connected to power. The device confirms a
// change but its read-back (GET /api/v1/sys/ac_power/) stays false either way, so only changes are offered.
export const POST = apiRoute(async (request) => {
	let input: { autoPowerOn?: unknown } = {};
	try {
		input = (await request.json()) as { autoPowerOn?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { autoPowerOn } = input;
	if (typeof autoPowerOn !== "boolean")
		throw new DeviceError("errors.request.expected", 400, { shape: "{ autoPowerOn: boolean }" });
	const result = await deviceJson<{ status?: string; message?: string }>("/api/v1/sys/ac_power/", {
		method: "POST",
		body: { switch: autoPowerOn ? 1 : 0 },
	});
	if (result.status !== "ok") {
		throw result.message
			? new DeviceError("errors.passthrough", 502, { message: result.message })
			: new DeviceError("errors.device.refusedChange", 502);
	}
	const t = await getT();
	return NextResponse.json({
		message: result.message ?? t(autoPowerOn ? "server.settings.enabled" : "server.settings.disabled"),
	});
});
