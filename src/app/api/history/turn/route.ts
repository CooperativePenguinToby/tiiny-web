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
			...(Array.isArray(assistant.steps) && assistant.steps.length > 0
				? {
						steps: assistant.steps.slice(0, 50).map((step) => ({
							id: String(step.id).slice(0, 100),
							tool: String(step.tool).slice(0, 100),
							label: String(step.label).slice(0, 300),
							arguments: String(step.arguments ?? "").slice(0, 4000),
							result: String(step.result ?? "").slice(0, 8000),
							ok: step.ok !== false,
						})),
					}
				: {}),
			...(Array.isArray(assistant.attachments) && assistant.attachments.length > 0
				? { attachments: assistant.attachments.map((item) => parseAttachment(item)) }
				: {}),
		},
		...(body.usage && typeof body.usage === "object" ? { usage: body.usage } : {}),
	});
	return NextResponse.json({ conversationId });
});
