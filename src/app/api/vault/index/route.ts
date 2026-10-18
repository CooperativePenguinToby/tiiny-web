import { deviceStream } from "@/server/device";
import { apiRoute, sseResponse } from "@/server/route";
import { kbHeaders, sourceIdFrom } from "@/server/vault";

// Indexes (embeds) an uploaded file and streams the device's progress. The device loads its embedding
// model if needed.
export const POST = apiRoute(async (request) => {
	const { sourceId } = (await request.json().catch(() => ({}))) as { sourceId?: unknown };
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
