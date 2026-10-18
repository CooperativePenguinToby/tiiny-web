import { NextResponse } from "next/server";
import { importMcpServers, listMcpServers } from "@/server/connectors";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async () => NextResponse.json(await listMcpServers()));

// POST { config: { mcpServers: { … } } }: adds the servers (they run on the device).
export const POST = apiRoute(async (request) => {
	const { config } = (await request.json().catch(() => ({}))) as { config?: unknown };
	await importMcpServers(config);
	return NextResponse.json(await listMcpServers());
});
