import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { KIND_OF_TYPE } from "@/server/playground";
import { apiRoute } from "@/server/route";

import type { PlaygroundModel } from "@/types/device";

export const GET = apiRoute(async () => {
	const [downloaded, running] = await Promise.all([
		deviceJson<{ data: { model_id: string; display_name: string; type: string }[] }>(
			"/api/v1/models/?including_downloading=false"
		),
		deviceJson<{ running: string[] }>("/api/v1/models/running"),
	]);
	const body: PlaygroundModel[] = downloaded.data
		.filter((model) => KIND_OF_TYPE[model.type])
		.map((model) => ({
			modelId: model.model_id,
			name: model.display_name,
			kind: KIND_OF_TYPE[model.type],
			loaded: running.running.includes(model.model_id),
		}));
	return NextResponse.json(body);
});
