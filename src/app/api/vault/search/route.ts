import { NextResponse } from "next/server";
import { DeviceError } from "@/server/device";
import { apiRoute } from "@/server/route";
import { searchVault } from "@/server/vault";

export const POST = apiRoute(async (request) => {
	const { query } = (await request.json().catch(() => ({}))) as { query?: unknown };
	if (typeof query !== "string" || !query.trim()) throw new DeviceError("Enter something to search for", 400);
	return NextResponse.json(await searchVault(query.trim()));
});
