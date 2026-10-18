import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { withModel } from "@/server/models";
import { modelIdOf, textOf } from "@/server/playground";
import { apiRoute } from "@/server/route";

// { model, query, documents: string[] } → documents ordered by relevance, with scores.
export const POST = apiRoute(async (request) => {
	const body = (await request.json().catch(() => ({}))) as { model?: unknown; query?: unknown; documents?: unknown };
	const model = modelIdOf(body.model);
	const query = textOf(body.query, "Query", 4000);
	if (!Array.isArray(body.documents) || body.documents.length < 2 || body.documents.length > 50) {
		throw new DeviceError("Give 2 to 50 documents", 400);
	}
	const documents = body.documents.map((doc, index) => textOf(doc, `Document ${index + 1}`, 8000));
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
		.sort((a, b) => b.score - a.score);
	return NextResponse.json({ results });
});
