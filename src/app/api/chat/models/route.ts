import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import type { RunningModels } from "@/server/device-types";
import { apiRoute } from "@/server/route";

import type { ChatModel } from "@/types/device";

interface OpenAiModel {
	id: string;
	supports_chat: boolean;
	supports_vision?: boolean;
	thinking?: { supported: boolean; toggleable: boolean; levels: string[]; default_level: string | null };
}

export const GET = apiRoute(async () => {
	const [models, running] = await Promise.all([
		deviceJson<{ data: OpenAiModel[] }>("/v1/models"),
		deviceJson<RunningModels>("/api/v1/models/running"),
	]);
	const instances = new Map(running.instances.running.map((instance) => [instance.model_id, instance]));
	const body: ChatModel[] = models.data
		.filter((model) => model.supports_chat)
		.map((model) => ({
			modelId: model.id,
			name: instances.get(model.id)?.display_name ?? model.id,
			activeRequests: instances.get(model.id)?.active_request_count ?? 0,
			supportsVision: model.supports_vision ?? false,
			thinking: {
				supported: model.thinking?.supported ?? false,
				toggleable: model.thinking?.toggleable ?? false,
				levels: model.thinking?.levels ?? [],
				defaultLevel: model.thinking?.default_level ?? null,
			},
		}));
	return NextResponse.json(body);
});
