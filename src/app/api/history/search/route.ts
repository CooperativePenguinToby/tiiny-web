import { NextResponse } from "next/server";
import { DeviceError } from "@/server/device";
import { searchConversations } from "@/server/history";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async (request) => {
	const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
	if (!query) throw new DeviceError("Enter something to search for", 400);
	return NextResponse.json(await searchConversations(query));
});
