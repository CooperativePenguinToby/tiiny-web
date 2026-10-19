import { NextResponse } from "next/server";
import { APP_ID } from "@/server/app-identity";
import { deviceStream } from "@/server/device";
import { withModel } from "@/server/models";
import { modelIdOf } from "@/server/playground";
import { apiRoute } from "@/server/route";

import type { BenchResult } from "@/types/device";
import { readSse } from "@/lib/sse";

// Like `tiiny bench`: one generation of about `tokens` tokens, timed. { model, tokens } → BenchResult.
export const POST = apiRoute(async (request) => {
	let body: { model?: unknown; tokens?: unknown } = {};
	try {
		body = (await request.json()) as { model?: unknown; tokens?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const model = modelIdOf(body.model);
	const tokens = Math.min(2048, Math.max(32, Number(body.tokens) || 256));
	const started = Date.now();
	let firstToken = 0;
	let usage = { prompt_tokens: 0, completion_tokens: 0 };
	const stream = await withModel(model, () =>
		deviceStream("/v1/chat/completions", {
			method: "POST",
			signal: request.signal,
			body: {
				model,
				stream: true,
				stream_options: { include_usage: true },
				max_tokens: tokens,
				thinking_enabled: false,
				app_id: APP_ID,
				task_type: "Replying",
				messages: [
					{ role: "user", content: "Write a long, detailed story about a lighthouse keeper. Do not stop early." },
				],
			},
		})
	);
	const events = readSse(new Response(stream));
	for await (const { data } of events) {
		if (data === "[DONE]") break;
		const chunk = JSON.parse(data) as {
			choices?: { delta?: { content?: string } }[];
			usage?: { prompt_tokens: number; completion_tokens: number };
		};
		if (!firstToken && chunk.choices?.[0]?.delta?.content) firstToken = Date.now();
		if (chunk.usage) usage = chunk.usage;
	}
	const finished = Date.now();
	const generating = (finished - (firstToken || started)) / 1000;
	const result: BenchResult = {
		promptTokens: usage.prompt_tokens,
		completionTokens: usage.completion_tokens,
		firstTokenMs: (firstToken || finished) - started,
		totalMs: finished - started,
		tokensPerSecond: generating > 0 ? Math.max(0, usage.completion_tokens - 1) / generating : 0,
	};
	return NextResponse.json(result);
});
