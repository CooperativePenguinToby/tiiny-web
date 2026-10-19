import { NextResponse } from "next/server";
import { DeviceError } from "@/server/device";
import { apiRoute } from "@/server/route";
import { resolveDeviceTarget } from "@/server/shared/device-target.mjs";

import type { ApiAccess } from "@/types/device";

function target(): { baseUrl: string; authKey: string } {
	const resolved = resolveDeviceTarget();
	if (!resolved) throw new DeviceError("errors.device.notConfiguredShort", 503);
	return resolved;
}

// Base URLs on the device's LAN address; the device serves all three API formats without a host name.
export const GET = apiRoute(async () => {
	const { baseUrl } = target();
	const body: ApiAccess = { openai: `${baseUrl}/v1`, anthropic: baseUrl, ollama: baseUrl };
	return NextResponse.json(body);
});

// The device API key, only when asked for (the Settings page reveals it on click).
export const POST = apiRoute(async () => NextResponse.json({ key: target().authKey }));
