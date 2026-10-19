import { NextResponse } from "next/server";
import { mcpIdFrom, mcpTools } from "@/server/connectors";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async (request) => {
	const id = mcpIdFrom(new URL(request.url).searchParams.get("id"));
	return NextResponse.json(await mcpTools(id));
});
