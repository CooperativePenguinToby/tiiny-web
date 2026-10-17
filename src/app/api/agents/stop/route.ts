import { NextResponse } from "next/server";
import { agentIdFrom } from "@/server/agents";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

// Acts on the whole compose service (all of the agent's containers), as the TiinyOS app does.
export const POST = apiRoute(async (request) => {
	const serviceId = await agentIdFrom(request, "serviceId");
	const result = await deviceJson<{ success?: boolean; message?: string; status?: string }>(
		`/api/services/${encodeURIComponent(serviceId)}/stop`,
		{ method: "POST", slow: true }
	);
	return NextResponse.json(result);
});
