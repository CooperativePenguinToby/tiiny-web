import { NextResponse } from "next/server";
import { inspectArchive } from "@/server/backup";
import { DeviceError } from "@/server/device";
import { apiRoute } from "@/server/route";

import { getT } from "@/i18n/server";

// Multipart "file": what a backup archive contains and whether it was made on this device.
export const POST = apiRoute(async (request) => {
	let form: FormData | null = null;
	try {
		form = await request.formData();
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const file = form?.get("file");
	if (!(file instanceof File)) throw new DeviceError("errors.backup.chooseFile", 400);
	const archive = Buffer.from(await file.arrayBuffer());
	return NextResponse.json(await inspectArchive(archive, await getT()));
});
