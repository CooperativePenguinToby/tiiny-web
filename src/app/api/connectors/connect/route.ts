import { NextResponse } from "next/server";
import { authUrl, connect, connectorKeyFrom } from "@/server/connectors";
import { apiRoute } from "@/server/route";

// POST { key, …credentials }. Account connectors answer { url } (the sign-in page to open); the others
// connect once the device accepts the credentials (WhatsApp answers { qr } to scan).
export const POST = apiRoute(async (request) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const key = connectorKeyFrom(body.key);
	if (["gmail", "google-calendar", "outlook-mail", "outlook-calendar"].includes(key)) {
		return NextResponse.json({ url: await authUrl(key) });
	}
	return NextResponse.json(await connect(key, body));
});
