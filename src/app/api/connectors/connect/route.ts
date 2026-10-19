import { NextResponse } from "next/server";
import { authUrl, connect, connectorKeyFrom } from "@/server/connectors";
import { apiRoute } from "@/server/route";

import { getT } from "@/i18n/server";

// POST { key, …credentials }. Account connectors answer { url } (the sign-in page to open); the others
// connect once the device accepts the credentials (WhatsApp answers { qr } to scan).
export const POST = apiRoute(async (request) => {
	let body: Record<string, unknown> = {};
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const key = connectorKeyFrom(body.key);
	return NextResponse.json(
		["gmail", "google-calendar", "outlook-mail", "outlook-calendar"].includes(key)
			? { url: await authUrl(key) }
			: await connect(key, body, await getT())
	);
});
