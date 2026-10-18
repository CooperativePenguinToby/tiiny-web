import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";
import { MAX_DEVICE_NAME } from "@/server/settings";

export const POST = apiRoute(async (request) => {
	const { name } = (await request.json().catch(() => ({}))) as { name?: unknown };
	const trimmed = typeof name === "string" ? name.trim() : "";
	if (!trimmed || trimmed.length > MAX_DEVICE_NAME) {
		throw new DeviceError(`Device name must be 1-${MAX_DEVICE_NAME} characters`, 400);
	}
	await deviceJson("/api/v1/account/device_name", { method: "POST", service: "auth", body: { device_name: trimmed } });
	return NextResponse.json({ name: trimmed });
});
