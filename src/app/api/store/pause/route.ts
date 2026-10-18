import { NextResponse } from "next/server";
import { deviceJson, modelPath } from "@/server/device";
import { modelIdFrom } from "@/server/models";
import { apiRoute } from "@/server/route";

// Pauses a store download; downloading the model again resumes it where it stopped.
export const POST = apiRoute(async (request) => {
	const modelId = await modelIdFrom(request);
	const result = await deviceJson<Record<string, unknown>>(`/api/v1/models/${modelPath(modelId)}/pause_download`, {
		method: "POST",
		body: { model_id: modelId },
	});
	return NextResponse.json(result);
});
