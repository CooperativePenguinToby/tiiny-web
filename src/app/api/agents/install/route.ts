import { agentIdFrom } from "@/server/agents";
import { deviceStream } from "@/server/device";
import { apiRoute, sseResponse } from "@/server/route";

// The device downloads the agent from Tiiny's cloud and installs it; progress is streamed through.
export const POST = apiRoute(async (request) => {
	const appId = await agentIdFrom(request, "appId");
	return sseResponse(
		await deviceStream("/api/services/download/stream", { method: "POST", body: { app_id: appId.replace(/^wa-/, "") } })
	);
});
