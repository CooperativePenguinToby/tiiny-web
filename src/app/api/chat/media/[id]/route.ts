import { DeviceError, deviceResponse } from "@/server/device";
import { apiRoute } from "@/server/route";

// An image from the device's media store (for thumbnails of attached images).
export const GET = apiRoute(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
	const { id } = await params;
	if (!/^media_[\da-f]+$/.test(id)) throw new DeviceError("errors.chat.invalidMediaId", 400);
	const media = await deviceResponse(`/api/v1/media/${id}/content`, { service: "media", stream: true });
	return new Response(media.body, {
		headers: {
			"Content-Type": media.headers.get("content-type") ?? "application/octet-stream",
			"Cache-Control": "private, max-age=3600",
		},
	});
});
