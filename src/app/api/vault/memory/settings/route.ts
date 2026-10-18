import { NextResponse } from "next/server";
import { memorySettings, saveMemorySettings } from "@/server/memory";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async () => NextResponse.json(await memorySettings()));

export const PUT = apiRoute(async (request) => {
	await saveMemorySettings(await request.json().catch(() => ({})));
	return NextResponse.json(await memorySettings());
});
