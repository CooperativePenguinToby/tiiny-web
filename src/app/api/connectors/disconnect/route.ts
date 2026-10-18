import { NextResponse } from "next/server";
import { connectorKeyFrom, disconnect } from "@/server/connectors";
import { apiRoute } from "@/server/route";

export const POST = apiRoute(async (request) => {
	const { key } = (await request.json().catch(() => ({}))) as { key?: unknown };
	await disconnect(connectorKeyFrom(key));
	return NextResponse.json({ disconnected: true });
});
