import { NextResponse } from "next/server";
import { DeviceError, deviceJson, modelPath } from "@/server/device";
import { apiRoute } from "@/server/route";

interface Candidate {
	unload_required: boolean;
	message?: string;
	// The models the device would unload to make room, in its order.
	model_id?: string[];
}

// GET ?modelId=…: whether loading the model first needs other models unloaded, and which.
export const GET = apiRoute(async (request) => {
	const modelId = new URL(request.url).searchParams.get("modelId") ?? "";
	if (!/^[\w.-]+\/[\w.-]+$/.test(modelId))
		throw new DeviceError("errors.request.modelIdFormat", 400, { field: "modelId" });
	const [reply, downloaded] = await Promise.all([
		deviceJson<Candidate>(`/api/v1/models/${modelPath(modelId)}/unload_candidate`),
		deviceJson<{ data: { model_id: string; display_name: string }[] }>("/api/v1/models/?including_downloading=false"),
	]);
	const names = new Map(downloaded.data.map((model) => [model.model_id, model.display_name]));
	return NextResponse.json({
		unloadRequired: reply.unload_required,
		message: reply.message ?? "",
		unload: (reply.unload_required ? (reply.model_id ?? []) : []).map((id) => ({
			modelId: id,
			name: names.get(id) ?? id,
		})),
	});
});
