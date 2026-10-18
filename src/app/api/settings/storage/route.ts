import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";
import { VAULT_EMBEDDING_MODEL } from "@/server/settings";

import type { StorageOverview } from "@/types/device";

interface SysStorage {
	total_bytes: number;
	used_bytes: number;
	details: { name: string; size_bytes: number }[];
}
interface ModelStorage {
	data: { models: { model_id: string; size_bytes: number }[] };
}
interface AgentStorage {
	apps: { name: string; size_bytes: number }[];
}

export const GET = apiRoute(async () => {
	const [storage, models, agents] = await Promise.all([
		deviceJson<SysStorage>("/api/v1/sys/storage"),
		deviceJson<ModelStorage>("/api/v1/models/storage"),
		deviceJson<AgentStorage>("/api/v1/sys/storage/agent"),
	]);
	const body: StorageOverview = {
		totalBytes: storage.total_bytes,
		usedBytes: storage.used_bytes,
		categories: storage.details.map((detail) => ({ name: detail.name, sizeBytes: detail.size_bytes })),
		models: models.data.models
			.map((model) => ({
				modelId: model.model_id,
				sizeBytes: model.size_bytes,
				protected: model.model_id === VAULT_EMBEDDING_MODEL,
			}))
			.sort((a, b) => b.sizeBytes - a.sizeBytes),
		// Agent containers are named `wa-<service id>`.
		agents: agents.apps
			.map((app) => ({ serviceId: app.name.replace(/^wa-/, ""), sizeBytes: app.size_bytes }))
			.sort((a, b) => b.sizeBytes - a.sizeBytes),
	};
	return NextResponse.json(body);
});
