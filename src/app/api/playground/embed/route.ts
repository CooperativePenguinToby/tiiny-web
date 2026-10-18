import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { withModel } from "@/server/models";
import { modelIdOf, textOf } from "@/server/playground";
import { apiRoute } from "@/server/route";

const cosine = (a: number[], b: number[]): number => {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (const [index, value] of a.entries()) {
		dot += value * b[index];
		na += value * value;
		nb += b[index] * b[index];
	}
	return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

// { model, inputs: string[] } → { dimensions, preview (first values of each vector), similarity matrix }.
export const POST = apiRoute(async (request) => {
	const body = (await request.json().catch(() => ({}))) as { model?: unknown; inputs?: unknown };
	const model = modelIdOf(body.model);
	if (!Array.isArray(body.inputs) || body.inputs.length === 0 || body.inputs.length > 16) {
		throw new DeviceError("Give 1 to 16 texts", 400);
	}
	const inputs = body.inputs.map((input, index) => textOf(input, `Text ${index + 1}`, 8000));
	const reply = await withModel(model, () =>
		deviceJson<{ data: { embedding: number[] }[]; usage?: { total_tokens?: number } }>("/v1/embeddings", {
			method: "POST",
			body: { model, input: inputs },
			slow: true,
		})
	);
	const vectors = reply.data.map((item) => item.embedding);
	return NextResponse.json({
		dimensions: vectors[0]?.length ?? 0,
		preview: vectors.map((vector) => vector.slice(0, 6)),
		similarity: vectors.map((a) => vectors.map((b) => cosine(a, b))),
		tokens: reply.usage?.total_tokens ?? null,
	});
});
