import { NextResponse } from "next/server";
import { DeviceError } from "@/server/device";
import { conversationIdFrom, saveTurn } from "@/server/history";
import { apiRoute } from "@/server/route";

import type { TurnToSave } from "@/types/device";

// Stores one exchange; creates the conversation on its first turn. Returns { conversationId }.
export const POST = apiRoute(async (request) => {
	const body = (await request.json().catch(() => ({}))) as Partial<TurnToSave>;
	const { assistant } = body;
	if (
		typeof body.modelId !== "string" ||
		typeof body.user !== "string" ||
		!body.user.trim() ||
		typeof assistant?.content !== "string" ||
		typeof assistant.stopped !== "boolean"
	) {
		throw new DeviceError("Expected { modelId, user, assistant: { content, stopped } }", 400);
	}
	const conversationId = await saveTurn({
		conversationId: body.conversationId ? conversationIdFrom(body.conversationId) : null,
		modelId: body.modelId,
		user: body.user,
		assistant: {
			content: assistant.content,
			stopped: assistant.stopped,
			...(typeof assistant.reasoning === "string" ? { reasoning: assistant.reasoning } : {}),
			...(typeof assistant.thinkingMs === "number" ? { thinkingMs: assistant.thinkingMs } : {}),
		},
		...(body.usage && typeof body.usage === "object" ? { usage: body.usage } : {}),
	});
	return NextResponse.json({ conversationId });
});
