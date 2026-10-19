import { NextResponse } from "next/server";
import { memorySettings, saveMemorySettings } from "@/server/memory";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async () => NextResponse.json(await memorySettings()));

export const PUT = apiRoute(async (request) => {
	let body: unknown = {};
	try {
		body = await request.json();
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	await saveMemorySettings(body);
	return NextResponse.json(await memorySettings());
});
