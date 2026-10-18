import { NextResponse } from "next/server";
import { parseAttachment } from "@/server/chat";
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
		(!body.user.trim() && !body.attachments?.length) ||
		typeof assistant?.content !== "string" ||
		(!assistant.content.trim() && !assistant.attachments?.length) ||
		typeof assistant.stopped !== "boolean"
	) {
		throw new DeviceError("Expected { modelId, user, assistant: { content, stopped } }", 400);
	}
	const conversationId = await saveTurn({
		conversationId: body.conversationId ? conversationIdFrom(body.conversationId) : null,
		modelId: body.modelId,
		user: body.user,
		...(Array.isArray(body.attachments) && body.attachments.length > 0
			? { attachments: body.attachments.map((item) => parseAttachment(item)) }
			: {}),
		assistant: {
			content: assistant.content,
			stopped: assistant.stopped,
			...(typeof assistant.reasoning === "string" ? { reasoning: assistant.reasoning } : {}),
			...(typeof assistant.thinkingMs === "number" ? { thinkingMs: assistant.thinkingMs } : {}),
			...(Array.isArray(assistant.attachments) && assistant.attachments.length > 0
				? { attachments: assistant.attachments.map((item) => parseAttachment(item)) }
				: {}),
		},
		...(body.usage && typeof body.usage === "object" ? { usage: body.usage } : {}),
	});
	return NextResponse.json({ conversationId });
});
