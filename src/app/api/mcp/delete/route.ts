import { NextResponse } from "next/server";
import { deleteMcpServer, mcpIdFrom } from "@/server/connectors";
import { apiRoute } from "@/server/route";

export const POST = apiRoute(async (request) => {
	let body: { id?: unknown } = {};
	try {
		body = (await request.json()) as { id?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { id } = body;
	await deleteMcpServer(mcpIdFrom(id));
	return NextResponse.json({ deleted: true });
});
