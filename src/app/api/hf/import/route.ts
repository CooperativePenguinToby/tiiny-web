import { deviceStream } from "@/server/device";
import { hfUrlFrom } from "@/server/hf";
import { apiRoute, sseResponse } from "@/server/route";

// Starts an import on the device and forwards its progress stream. The import keeps running on
// the device if the browser disconnects; cancel it with /api/hf/import/cancel.
export const POST = apiRoute(async (request) => {
	const body = (await request
		.clone()
		.json()
		.catch(() => ({}))) as { lora?: unknown; baseModelId?: unknown };
	const hfUrl = await hfUrlFrom(request);
	const lora = body.lora === true && typeof body.baseModelId === "string";
	return sseResponse(
		await deviceStream("/api/v1/models/import", {
			method: "POST",
			body: { hf_url: hfUrl, ...(lora ? { lora: true, base_model_id: body.baseModelId } : {}) },
		})
	);
});
