import { deviceResponse } from "@/server/device";
import { apiRoute } from "@/server/route";
import { kbHeaders, sourceIdFrom } from "@/server/vault";

// GET ?id=<source id>: the original file as stored on the device.
export const GET = apiRoute(async (request) => {
	const id = sourceIdFrom(new URL(request.url).searchParams.get("id"));
	const file = await deviceResponse(`/kb/files/${encodeURIComponent(id)}`, {
		service: "kb",
		headers: await kbHeaders(),
		stream: true,
	});
	return new Response(file.body, {
		headers: {
			"Content-Type": file.headers.get("content-type") ?? "application/octet-stream",
			"Content-Disposition": file.headers.get("content-disposition") ?? `attachment; filename="${id}"`,
			...(file.headers.get("content-length") ? { "Content-Length": file.headers.get("content-length")! } : {}),
		},
	});
});
