import { deviceStream } from "@/server/device";
import { apiRoute, sseResponse } from "@/server/route";
import { kbHeaders, sourceIdFrom } from "@/server/vault";

// Indexes (embeds) an uploaded file and streams the device's progress. The device loads its embedding
// model if needed.
export const POST = apiRoute(async (request) => {
	let input: { sourceId?: unknown } = {};
	try {
		input = (await request.json()) as { sourceId?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { sourceId } = input;
	return sseResponse(
		await deviceStream("/kb/finalize/stream", {
			method: "POST",
			service: "kb",
			headers: { ...(await kbHeaders()), Accept: "text/event-stream" },
			body: { source_id: sourceIdFrom(sourceId), auto_load_embedding_model: true },
			signal: request.signal,
		})
	);
});
