import { parseMessage } from "@/server/chat";
import { DeviceError } from "@/server/device";
import { apiRoute, sseResponse } from "@/server/route";
import { runTask } from "@/server/task";

import type { ThinkingSetting } from "@/types/device";

// Task mode: streams the reply and each tool step as events (see TaskEvent). When the browser goes away,
// request.signal stops the model and any running tool.
export const POST = apiRoute(async (request) => {
	const { modelId, messages, thinking } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	if (typeof modelId !== "string" || !Array.isArray(messages) || messages.length === 0) {
		throw new DeviceError("Expected { modelId, messages }", 400);
	}
	const parsed = messages.map((message) => parseMessage(message));
	const setting = typeof thinking === "string" ? (thinking as ThinkingSetting) : "off";
	const encoder = new TextEncoder();
	const events = runTask({ modelId, messages: parsed, thinking: setting, signal: request.signal });
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
					const message = error instanceof Error ? error.message : String(error);
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`));
				}
				controller.close();
			}
		},
	});
	return sseResponse(stream);
});
