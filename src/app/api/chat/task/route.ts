import { parseMessage } from "@/server/chat";
import { DeviceError } from "@/server/device";
import { apiRoute, sseResponse } from "@/server/route";
import { runTask } from "@/server/task";

import type { ThinkingSetting } from "@/types/device";
import { getT } from "@/i18n/server";

// Task mode: streams the reply and each tool step as events (see TaskEvent). When the browser goes away,
// request.signal stops the model and any running tool.
export const POST = apiRoute(async (request) => {
	let body: Record<string, unknown> = {};
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { modelId, messages, thinking, tools } = body;
	if (typeof modelId !== "string" || !Array.isArray(messages) || messages.length === 0) {
		throw new DeviceError("errors.request.expected", 400, { shape: "{ modelId, messages }" });
	}
	const parsed = messages.map((message) => parseMessage(message));
	const setting = typeof thinking === "string" ? (thinking as ThinkingSetting) : "off";
	// Resolved here: the request's cookies and headers cannot be read once the stream runs.
	const t = await getT();
	const encoder = new TextEncoder();
	// Vault and web pages are on unless switched off.
	const allowed = (tools ?? {}) as { vault?: unknown; web?: unknown };
	const events = runTask({
		modelId,
		messages: parsed,
		thinking: setting,
		tools: { vault: allowed.vault !== false, web: allowed.web !== false },
		signal: request.signal,
		t,
	});
	const stream = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { value, done } = await events.next();
				if (done) {
					controller.close();
					return;
				}
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
			} catch (error) {
				if (!request.signal.aborted) {
					const message =
						error instanceof DeviceError
							? t(error.key, error.values)
							: error instanceof Error
								? error.message
								: String(error);
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`));
				}
				controller.close();
			}
		},
	});
	return sseResponse(stream);
});
