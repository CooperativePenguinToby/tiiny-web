import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";
import { kbHeaders, sourceIdFrom } from "@/server/vault";

// Removes a Vault file or a chat-history summary together with its index entries.
export const POST = apiRoute(async (request) => {
	let input: { sourceId?: unknown } = {};
	try {
		input = (await request.json()) as { sourceId?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { sourceId } = input;
	const result = await deviceJson<{ success?: boolean }>("/kb/delete-memory", {
		method: "POST",
		service: "kb",
		headers: await kbHeaders(),
		body: { source_id: sourceIdFrom(sourceId) },
	});
	return NextResponse.json(result);
});
