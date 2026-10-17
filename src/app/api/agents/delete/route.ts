import { NextResponse } from "next/server";
import { agentIdFrom } from "@/server/agents";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

export const POST = apiRoute(async (request) => {
	const serviceId = await agentIdFrom(request, "serviceId");
	const result = await deviceJson<unknown>(`/api/services/${encodeURIComponent(serviceId)}`, {
		method: "DELETE",
		slow: true,
	});
	return NextResponse.json(result);
});
