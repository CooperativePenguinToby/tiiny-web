import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";
import { MAX_DEVICE_NAME } from "@/server/settings";

export const POST = apiRoute(async (request) => {
	let input: { name?: unknown } = {};
	try {
		input = (await request.json()) as { name?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { name } = input;
	const trimmed = typeof name === "string" ? name.trim() : "";
	if (!trimmed || trimmed.length > MAX_DEVICE_NAME) {
		throw new DeviceError("errors.settings.deviceNameLength", 400, { count: MAX_DEVICE_NAME });
	}
	await deviceJson("/api/v1/account/device_name", { method: "POST", service: "auth", body: { device_name: trimmed } });
	return NextResponse.json({ name: trimmed });
});
