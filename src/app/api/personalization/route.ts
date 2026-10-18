import { NextResponse } from "next/server";
import { parsePersonalization, readUserContext, writePersonalization } from "@/server/personalization";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async () => {
	const { profile } = await readUserContext();
	return NextResponse.json(profile);
});

export const PUT = apiRoute(async (request) => {
	const profile = parsePersonalization(await request.json().catch(() => ({})));
	await writePersonalization(profile);
	const saved = await readUserContext();
	return NextResponse.json(saved.profile);
});
