import { NextResponse } from "next/server";
import { DeviceError } from "@/server/device";
import { apiRoute } from "@/server/route";
import { resolveDeviceTarget } from "@/server/shared/device-target.mjs";
import { apiHost, apiPort, PROXY_PREFIX } from "@/server/shared/model-api.mjs";

import type { ApiAccess } from "@/types/device";

function target(): { baseUrl: string; authKey: string } {
	const resolved = resolveDeviceTarget();
	if (!resolved) throw new DeviceError("errors.device.notConfiguredShort", 503);
	return resolved;
}

// Base URLs of this app's HTTPS proxy for the device's model APIs, on the host the browser used: the
// API port, then `api.<AGENT_DOMAIN>` when set, then the per-format paths on this app's own port.
export const GET = apiRoute(async (request) => {
	target();
	const app = new URL(`https://${request.headers.get("host") ?? "localhost"}`);
	const onApiPort = new URL(app.href);
	onApiPort.port = String(apiPort());
	const subdomain = apiHost();
	const onSubdomain = subdomain ? new URL(app.href) : null;
	if (onSubdomain && subdomain) onSubdomain.hostname = subdomain;
	const bases = (format: keyof ApiAccess, suffix: string): string[] =>
		[onApiPort.origin, onSubdomain?.origin, `${app.origin}${PROXY_PREFIX}/${format}`]
			.filter((base) => base !== undefined)
			.map((base) => `${base}${suffix}`);
	const body: ApiAccess = {
		openai: bases("openai", "/v1"),
		anthropic: bases("anthropic", ""),
		ollama: bases("ollama", ""),
	};
	return NextResponse.json(body);
});

// The device API key, only when asked for (the Settings page reveals it on click).
export const POST = apiRoute(async () => NextResponse.json({ key: target().authKey }));
