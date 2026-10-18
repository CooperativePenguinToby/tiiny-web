import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

import type { StoreModel } from "@/types/device";

interface OnlineModel {
	model_id: string;
	name: string;
	type: string;
	params: string;
	npu_usage: number;
	status: string;
	progress: number | null;
	desc: string | null;
	likes: number | null;
	downloads: number | null;
	is_trend: boolean | null;
	input?: string;
	output?: string;
	context_window?: number | null;
	recommend_rank?: number | null;
	image_size?: string | null;
	steps?: number | null;
	guidance_scale?: string | null;
	load_time?: number | null;
	thinking?: { supported: boolean; toggleable: boolean; levels: string[]; default_level: string | null };
}

// Store descriptions are HTML snippets; the UI shows plain text.
const plainText = (html: string | null): string =>
	(html ?? "")
		.replaceAll(/<[^>]*>/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim();

interface LocalModel {
	model_id: string;
	status: string;
	progress: number | null;
}

export const GET = apiRoute(async () => {
	// The catalogue's own status can lag behind the device; the device's model list is authoritative.
	const [models, local] = await Promise.all([
		deviceJson<OnlineModel[]>("/api/v1/models/online_models"),
		deviceJson<{ data: LocalModel[] }>("/api/v1/models/?including_downloading=true"),
	]);
	const onDevice = new Map(local.data.map((model) => [model.model_id, model]));
	const body: StoreModel[] = models.map((model) => ({
		modelId: model.model_id,
		name: model.name,
		type: model.type,
		params: model.params,
		npuUsage: model.npu_usage,
		status: onDevice.get(model.model_id)?.status ?? "not_downloaded",
		progress: onDevice.get(model.model_id)?.progress ?? model.progress ?? 0,
		description: plainText(model.desc),
		likes: model.likes ?? 0,
		downloads: model.downloads ?? 0,
		trending: model.is_trend ?? false,
		details: {
			input: model.input ?? "",
			output: model.output ?? "",
			contextWindow: model.context_window ?? null,
			recommendRank: model.recommend_rank ?? null,
			image: model.image_size
				? { size: model.image_size, steps: model.steps ?? null, guidanceScale: model.guidance_scale ?? null }
				: null,
			thinking: {
				supported: model.thinking?.supported ?? false,
				toggleable: model.thinking?.toggleable ?? false,
				levels: model.thinking?.levels ?? [],
				defaultLevel: model.thinking?.default_level ?? null,
			},
			loadSeconds: model.load_time ?? null,
		},
	}));
	return NextResponse.json(body);
});
