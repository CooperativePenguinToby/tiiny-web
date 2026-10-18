import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";
import { kbHeaders, sourceIdFrom } from "@/server/vault";

export const POST = apiRoute(async (request) => {
	const { sourceId, filename } = (await request.json().catch(() => ({}))) as { sourceId?: unknown; filename?: unknown };
	const id = sourceIdFrom(sourceId);
	const name = typeof filename === "string" ? filename.trim() : "";
	if (!name || name.length > 255 || /[\\/]/.test(name)) throw new DeviceError("Enter a file name without slashes", 400);
	await deviceJson(`/kb/sources/${encodeURIComponent(id)}`, {
		method: "PATCH",
		service: "kb",
		headers: await kbHeaders(),
		body: { filename: name },
	});
	return NextResponse.json({ filename: name });
});
