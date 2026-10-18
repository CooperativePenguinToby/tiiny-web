import { NextResponse } from "next/server";
import { conversationIdFrom, deleteConversation } from "@/server/history";
import { apiRoute } from "@/server/route";

export const POST = apiRoute(async (request) => {
	const { conversationId } = (await request.json().catch(() => ({}))) as { conversationId?: unknown };
	await deleteConversation(conversationIdFrom(conversationId));
	return NextResponse.json({ deleted: true });
});
