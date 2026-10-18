import { NextResponse } from "next/server";
import { deleteMcpServer, mcpIdFrom } from "@/server/connectors";
import { apiRoute } from "@/server/route";

export const POST = apiRoute(async (request) => {
	const { id } = (await request.json().catch(() => ({}))) as { id?: unknown };
	await deleteMcpServer(mcpIdFrom(id));
	return NextResponse.json({ deleted: true });
});
