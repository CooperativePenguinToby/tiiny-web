import { restoreBackup, servicesFrom } from "@/server/backup";
import { DeviceError } from "@/server/device";
import { apiRoute, sseResponse } from "@/server/route";

// Multipart: file (a backup archive), services (JSON list). Replaces those categories on the device with
// the backup's contents and streams the device's per-category results.
export const POST = apiRoute(async (request) => {
	let form: FormData | null = null;
	try {
		form = await request.formData();
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const file = form?.get("file");
	if (!(file instanceof File)) throw new DeviceError("Choose a backup file", 400);
	let services: unknown;
	try {
		services = JSON.parse(String(form?.get("services") ?? "[]"));
	} catch {
		throw new DeviceError("services must be a JSON list", 400);
	}
	const archive = Buffer.from(await file.arrayBuffer());
	return sseResponse(await restoreBackup(archive, await servicesFrom(services), request.signal));
});
