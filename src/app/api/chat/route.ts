import { DeviceError, deviceStream } from "@/server/device";
import { apiRoute, sseResponse } from "@/server/route";

import type { ChatMessage, ThinkingSetting } from "@/types/device";

interface ChatRequest {
	modelId?: unknown;
	messages?: unknown;
	thinking?: unknown;
}

function isMessage(value: unknown): value is ChatMessage {
	const message = value as ChatMessage;
	return (message?.role === "user" || message?.role === "assistant") && typeof message.content === "string";
}

// Streams an OpenAI-compatible chat completion from the device. Aborting the browser request
// aborts the device request too.
export const POST = apiRoute(async (request) => {
	const { modelId, messages, thinking } = (await request.json().catch(() => ({}))) as ChatRequest;
	if (
		typeof modelId !== "string" ||
		!Array.isArray(messages) ||
		messages.length === 0 ||
		!messages.every((message) => isMessage(message))
	) {
		throw new DeviceError("Expected { modelId, messages: [{ role, content }] }", 400);
	}
	const setting = typeof thinking === "string" ? (thinking as ThinkingSetting) : "off";
	const body = {
		model: modelId,
		messages: messages.map(({ role, content }) => ({ role, content })),
		stream: true,
		thinking_enabled: setting !== "off",
		...(setting === "off" ? {} : { reasoning_effort: setting }),
	};
	return sseResponse(await deviceStream("/v1/chat/completions", { method: "POST", body, signal: request.signal }));
});
