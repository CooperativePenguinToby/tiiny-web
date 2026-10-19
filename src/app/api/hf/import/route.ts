import { deviceStream } from "@/server/device";
import { hfUrlFrom } from "@/server/hf";
import { apiRoute, sseResponse } from "@/server/route";

// Starts an import on the device and forwards its progress stream. The import keeps running on
// the device if the browser disconnects; cancel it with /api/hf/import/cancel.
export const POST = apiRoute(async (request) => {
	// Read from a copy: hfUrlFrom reads the request itself.
	const copy = request.clone();
	let body: { lora?: unknown; baseModelId?: unknown } = {};
	try {
		body = (await copy.json()) as { lora?: unknown; baseModelId?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const hfUrl = await hfUrlFrom(request);
	const isLora = body.lora === true && typeof body.baseModelId === "string";
	return sseResponse(
		await deviceStream("/api/v1/models/import", {
			method: "POST",
			body: { hf_url: hfUrl, ...(isLora && { lora: true, base_model_id: body.baseModelId }) },
		})
	);
});
