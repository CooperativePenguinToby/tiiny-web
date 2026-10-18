import { NextResponse } from "next/server";
import { conversationIdFrom, readConversation } from "@/server/history";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
	const { id } = await params;
	return NextResponse.json(await readConversation(conversationIdFrom(id)));
});
