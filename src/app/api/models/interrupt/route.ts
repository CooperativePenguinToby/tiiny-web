import { NextResponse } from "next/server";
import { deviceJson, modelPath } from "@/server/device";
import { modelIdFrom } from "@/server/models";
import { apiRoute } from "@/server/route";

// Stops the model's running inference tasks, whichever app started them (as `tiiny interrupt` does).
export const POST = apiRoute(async (request) => {
	const modelId = await modelIdFrom(request);
	const result = await deviceJson<Record<string, unknown>>(`/api/v1/models/${modelPath(modelId)}/interrupt`, {
		method: "POST",
	});
	return NextResponse.json(result);
});
