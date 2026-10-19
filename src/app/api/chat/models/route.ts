import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import type { RunningModels } from "@/server/device-types";
import { apiRoute } from "@/server/route";

import type { ChatModel } from "@/types/device";

interface DownloadedModel {
	model_id: string;
	display_name: string;
	type: string;
	status: string;
	input?: string;
	npu_usage: number;
	thinking?: { supported: boolean; toggleable: boolean; levels: string[]; default_level: string | null };
}

const CHAT_TYPES = new Set(["Text Generation", "Image-Text-to-Text"]);
const IMAGE_TYPES = new Set(["Text-to-Image"]);

// Every downloaded model chat can use: text models reply, text-to-image models draw. Loaded ones first.
export const GET = apiRoute(async () => {
	const [downloaded, running] = await Promise.all([
		deviceJson<{ data: DownloadedModel[] }>("/api/v1/models/?including_downloading=false"),
		deviceJson<RunningModels>("/api/v1/models/running"),
	]);
	const instances = new Map(running.instances.running.map((instance) => [instance.model_id, instance]));
	const body: ChatModel[] = downloaded.data
		.filter((model) => CHAT_TYPES.has(model.type) || IMAGE_TYPES.has(model.type))
		.map((model) => {
			const kind = IMAGE_TYPES.has(model.type) ? "image" : "chat";
			const instance = instances.get(model.model_id);
			return {
				modelId: model.model_id,
				name: model.display_name,
				kind,
				loaded: instance?.status === "running",
				npuUsage: model.npu_usage,
				activeRequests: instance?.active_request_count ?? 0,
				supportsVision: kind === "chat" && (model.input ?? "").split(",").includes("Image"),
				thinking: {
					supported: kind === "chat" && (model.thinking?.supported ?? false),
					toggleable: model.thinking?.toggleable ?? false,
					levels: model.thinking?.levels ?? [],
					defaultLevel: model.thinking?.default_level ?? null,
				},
			} satisfies ChatModel;
		})
		.toSorted((a, b) => Number(b.loaded) - Number(a.loaded));
	return NextResponse.json(body);
});
