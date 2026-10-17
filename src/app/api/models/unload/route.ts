import { NextResponse } from "next/server";
import { deviceJson, modelPath } from "@/server/device";
import { modelIdFrom } from "@/server/models";
import { apiRoute } from "@/server/route";

export const POST = apiRoute(async (request) => {
	const modelId = await modelIdFrom(request);
	const result = await deviceJson<{ message: string }>(`/api/v1/models/${modelPath(modelId)}/stop`, { method: "POST" });
	return NextResponse.json({ message: result.message });
});
