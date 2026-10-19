import { NextResponse } from "next/server";
import { parsePersonalization, readUserContext, writePersonalization } from "@/server/personalization";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async () => {
	const { profile } = await readUserContext();
	return NextResponse.json(profile);
});

export const PUT = apiRoute(async (request) => {
	let body: unknown = {};
	try {
		body = await request.json();
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const profile = parsePersonalization(body);
	await writePersonalization(profile);
	const saved = await readUserContext();
	return NextResponse.json(saved.profile);
});
