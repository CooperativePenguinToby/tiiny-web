import { APP_ID } from "@/server/app-identity";
import { parseMessage, toDeviceMessage } from "@/server/chat";
import { DeviceError, deviceStream } from "@/server/device";
import { apiRoute, sseResponse } from "@/server/route";

import type { ThinkingSetting } from "@/types/device";

interface ChatRequest {
	modelId?: unknown;
	messages?: unknown;
	thinking?: unknown;
}

// Streams an OpenAI-compatible chat completion from the device. Aborting the browser request
// aborts the device request too.
export const POST = apiRoute(async (request) => {
	let input: ChatRequest = {};
	try {
		input = (await request.json()) as ChatRequest;
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { modelId, messages, thinking } = input;
	if (typeof modelId !== "string" || !Array.isArray(messages) || messages.length === 0) {
		throw new DeviceError("Expected { modelId, messages: [{ role, content }] }", 400);
	}
	const setting = typeof thinking === "string" ? (thinking as ThinkingSetting) : "off";
	const body = {
		model: modelId,
		messages: messages.map((message) => toDeviceMessage(parseMessage(message))),
		stream: true,
		stream_options: { include_usage: true },
		// Lets the device attribute the tokens to this app, as TiinyOS does for its own chats.
		app_id: APP_ID,
		task_type: "Replying",
		thinking_enabled: setting !== "off",
		...(setting !== "off" && { reasoning_effort: setting }),
	};
	return sseResponse(await deviceStream("/v1/chat/completions", { method: "POST", body, signal: request.signal }));
});
