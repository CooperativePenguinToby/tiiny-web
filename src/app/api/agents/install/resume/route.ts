import { agentIdFrom } from "@/server/agents";
import { deviceStream } from "@/server/device";
import { apiRoute, sseResponse } from "@/server/route";

// Continues a paused agent install where it stopped; progress is streamed like a fresh install.
export const POST = apiRoute(async (request) => {
	const id = await agentIdFrom(request, "appId");
	const appId = id.replace(/^wa-/, "");
	return sseResponse(
		await deviceStream("/api/services/download/resume", {
			method: "POST",
			service: "agents",
			body: { app_id: appId },
			signal: request.signal,
		})
	);
});
