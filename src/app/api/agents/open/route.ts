import { NextResponse } from "next/server";
import { DeviceError } from "@/server/device";
import { apiRoute } from "@/server/route";
import { agentDomain, HANDOFF_PATH } from "@/server/shared/agent-domain.mjs";
import { createHandoffToken } from "@/server/shared/session-token.mjs";

// Opens an agent at `https://<service id>.<AGENT_DOMAIN>` on the port the browser used for this app:
// redirects to the agent host with a one-time link, which signs that host in.
export const GET = apiRoute(async (request) => {
	const domain = agentDomain();
	if (!domain) throw new DeviceError("Agent subdomains are not configured (AGENT_DOMAIN)", 404);
	const serviceId = new URL(request.url).searchParams.get("id")?.toLowerCase() ?? "";
	if (!/^[a-z0-9-]+$/.test(serviceId)) throw new DeviceError("Expected ?id=<agent service id>", 400);
	const port = /:(\d+)$/.exec(request.headers.get("host") ?? "")?.[1];
	const target = new URL(`https://${serviceId}.${domain}${port ? `:${port}` : ""}${HANDOFF_PATH}`);
	target.searchParams.set("token", createHandoffToken(serviceId));
	return NextResponse.redirect(target, { headers: { "Cache-Control": "no-store" } });
});
