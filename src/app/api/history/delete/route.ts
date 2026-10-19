import { NextResponse } from "next/server";
import { conversationIdFrom, deleteConversation } from "@/server/history";
import { apiRoute } from "@/server/route";

export const POST = apiRoute(async (request) => {
	let body: { conversationId?: unknown } = {};
	try {
		body = (await request.json()) as { conversationId?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { conversationId } = body;
	await deleteConversation(conversationIdFrom(conversationId));
	return NextResponse.json({ deleted: true });
});
