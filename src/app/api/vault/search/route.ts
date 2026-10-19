import { NextResponse } from "next/server";
import { DeviceError } from "@/server/device";
import { apiRoute } from "@/server/route";
import { searchVault } from "@/server/vault";

export const POST = apiRoute(async (request) => {
	let body: { query?: unknown } = {};
	try {
		body = (await request.json()) as { query?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { query } = body;
	if (typeof query !== "string" || !query.trim()) throw new DeviceError("Enter something to search for", 400);
	return NextResponse.json(await searchVault(query.trim()));
});
