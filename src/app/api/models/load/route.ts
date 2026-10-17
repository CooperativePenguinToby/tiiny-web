import { deviceStream, modelPath } from "@/server/device";
import { modelIdFrom } from "@/server/models";
import { apiRoute, sseResponse } from "@/server/route";

// Forwards the device's launch progress stream (SSE) to the browser.
export const POST = apiRoute(async (request) => {
	const modelId = await modelIdFrom(request);
	return sseResponse(await deviceStream(`/api/v1/models/${modelPath(modelId)}/launch/stream`, { method: "POST" }));
});
