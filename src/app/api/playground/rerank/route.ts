import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { withModel } from "@/server/models";
import { modelIdOf, textOf } from "@/server/playground";
import { apiRoute } from "@/server/route";

// { model, query, documents: string[] } → documents ordered by relevance, with scores.
export const POST = apiRoute(async (request) => {
	let body: { model?: unknown; query?: unknown; documents?: unknown } = {};
	try {
		body = (await request.json()) as { model?: unknown; query?: unknown; documents?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const model = modelIdOf(body.model);
	const query = textOf(body.query, { kind: "query" }, 4000);
	if (!Array.isArray(body.documents) || body.documents.length < 2 || body.documents.length > 50) {
		throw new DeviceError("errors.playground.documentCount", 400, { min: 2, max: 50 });
	}
	const documents = body.documents.map((document_, index) =>
		textOf(document_, { kind: "document", number: index + 1 }, 8000)
	);
	const reply = await withModel(model, () =>
		deviceJson<{ results: { index: number; relevance_score?: number; score?: number }[] }>("/v1/rerank", {
			method: "POST",
			body: { model, query, documents },
			slow: true,
		})
	);
	const results = reply.results
		.map((result) => ({
			index: result.index,
			document: documents[result.index],
			score: result.relevance_score ?? result.score ?? 0,
		}))
		.toSorted((a, b) => b.score - a.score);
	return NextResponse.json({ results });
});
