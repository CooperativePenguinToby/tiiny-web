import { agentIdFrom } from "@/server/agents";
import { deviceStream } from "@/server/device";
import { apiRoute, sseResponse } from "@/server/route";

// Updates an installed agent to the store's latest version; the device streams its progress.
export const POST = apiRoute(async (request) => {
	const serviceId = await agentIdFrom(request, "serviceId");
	return sseResponse(
		await deviceStream(`/api/services/${encodeURIComponent(serviceId)}/update/stream`, {
			method: "POST",
			service: "agents",
			body: { force: false },
			signal: request.signal,
		})
	);
});
