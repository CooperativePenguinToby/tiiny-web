import { NextResponse } from "next/server";
import { importMcpServers, listMcpServers } from "@/server/connectors";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async () => NextResponse.json(await listMcpServers()));

// POST { config: { mcpServers: { … } } }: adds the servers (they run on the device).
export const POST = apiRoute(async (request) => {
	let body: { config?: unknown } = {};
	try {
		body = (await request.json()) as { config?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { config } = body;
	await importMcpServers(config);
	return NextResponse.json(await listMcpServers());
});
