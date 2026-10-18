import { NextResponse } from "next/server";
import { agentIdFrom } from "@/server/agents";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

// Pauses an agent install at the next chunk; /api/agents/install/resume continues it.
export const POST = apiRoute(async (request) => {
	const id = await agentIdFrom(request, "appId");
	const appId = id.replace(/^wa-/, "");
	const result = await deviceJson<{ status?: string; message?: string }>("/api/services/download/pause", {
		method: "POST",
		service: "agents",
		body: { app_id: appId },
	});
	return NextResponse.json(result);
});
