import { NextResponse } from "next/server";
import { deviceResponse } from "@/server/device";
import { apiRoute } from "@/server/route";
import { kbHeaders, sourceIdFrom } from "@/server/vault";

// GET ?id=<source id>: the full text of one day's summary.
export const GET = apiRoute(async (request) => {
	const id = sourceIdFrom(new URL(request.url).searchParams.get("id"));
	const file = await deviceResponse(`/kb/files/${encodeURIComponent(id)}`, {
		service: "kb",
		headers: await kbHeaders(),
	});
	return NextResponse.json({ text: await file.text() });
});
