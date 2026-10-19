import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

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
	if (typeof autoPowerOn !== "boolean") throw new DeviceError("Expected { autoPowerOn: boolean }", 400);
	const result = await deviceJson<{ status?: string; message?: string }>("/api/v1/sys/ac_power/", {
		method: "POST",
		body: { switch: autoPowerOn ? 1 : 0 },
	});
	if (result.status !== "ok") throw new DeviceError(result.message || "The device refused the change", 502);
	return NextResponse.json({ message: result.message ?? (autoPowerOn ? "Enabled" : "Disabled") });
});
