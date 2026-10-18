import { NextResponse } from "next/server";
import { mcpIdFrom, mcpTools } from "@/server/connectors";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async (request) =>
	NextResponse.json(await mcpTools(mcpIdFrom(new URL(request.url).searchParams.get("id"))))
);
