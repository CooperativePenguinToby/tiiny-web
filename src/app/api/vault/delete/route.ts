import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";
import { kbHeaders, sourceIdFrom } from "@/server/vault";

// Removes a Vault file or a chat-history summary together with its index entries.
export const POST = apiRoute(async (request) => {
	const { sourceId } = (await request.json().catch(() => ({}))) as { sourceId?: unknown };
	const result = await deviceJson<{ success?: boolean }>("/kb/delete-memory", {
		method: "POST",
		service: "kb",
		headers: await kbHeaders(),
		body: { source_id: sourceIdFrom(sourceId) },
	});
	return NextResponse.json(result);
});
