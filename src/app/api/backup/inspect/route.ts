import { NextResponse } from "next/server";
import { inspectArchive } from "@/server/backup";
import { DeviceError } from "@/server/device";
import { apiRoute } from "@/server/route";

// Multipart "file": what a backup archive contains and whether it was made on this device.
export const POST = apiRoute(async (request) => {
	const form = await request.formData().catch(() => null);
	const file = form?.get("file");
	if (!(file instanceof File)) throw new DeviceError("Choose a backup file", 400);
	return NextResponse.json(await inspectArchive(Buffer.from(await file.arrayBuffer())));
});
