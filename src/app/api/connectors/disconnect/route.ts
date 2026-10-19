import { NextResponse } from "next/server";
import { connectorKeyFrom, disconnect } from "@/server/connectors";
import { apiRoute } from "@/server/route";

export const POST = apiRoute(async (request) => {
	let body: { key?: unknown } = {};
	try {
		body = (await request.json()) as { key?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { key } = body;
	await disconnect(connectorKeyFrom(key));
	return NextResponse.json({ disconnected: true });
});
