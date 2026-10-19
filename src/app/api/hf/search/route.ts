import { NextResponse } from "next/server";
import { DeviceError } from "@/server/device";
import { apiRoute } from "@/server/route";

import type { HfRepository } from "@/types/device";

interface HubModel {
	id: string;
	downloads?: number;
	likes?: number;
	pipeline_tag?: string;
}

const RELATIONS = ["adapter", "finetune"] as const;

async function hubSearch(filter: string, query: string, limit: number): Promise<HubModel[]> {
	const url = new URL("https://huggingface.co/api/models");
	url.searchParams.set("filter", filter);
	url.searchParams.set("sort", "downloads");
	url.searchParams.set("limit", String(limit));
	if (query) url.searchParams.set("search", query);
	let response: Response;
	try {
		response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
	} catch (error) {
		throw new DeviceError("errors.hf.unreachable", 502, { reason: String(error) });
	}
	if (!response.ok) throw new DeviceError("errors.hf.responded", 502, { status: response.status });
	return (await response.json()) as HubModel[];
}

// Lists Hugging Face repos derived from a base model (LoRA adapters and fine-tunes). Whether the
// device can import one is decided per repo by /api/hf/inspect.
export const GET = apiRoute(async (request) => {
	const parameters = new URL(request.url).searchParams;
	const base = parameters.get("base") ?? "";
	if (!/^[\w.-]+\/[\w.-]+$/.test(base)) throw new DeviceError("errors.request.modelIdLike", 400, { field: "base" });
	const limit = Number(parameters.get("limit") ?? 40);
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
		throw new DeviceError("errors.request.range", 400, { field: "limit", min: 1, max: 100 });
	const query = (parameters.get("q") ?? "").trim();
	const results = await Promise.all(
		RELATIONS.map(async (relation) => {
			const models = await hubSearch(`base_model:${relation}:${base}`, query, limit);
			return models.map((model): HfRepository => ({
				repoId: model.id,
				relation,
				downloads: model.downloads ?? 0,
				likes: model.likes ?? 0,
				pipelineTag: model.pipeline_tag ?? null,
			}));
		})
	);
	const repos = results.flat().toSorted((a, b) => b.downloads - a.downloads);
	return NextResponse.json(repos);
});
