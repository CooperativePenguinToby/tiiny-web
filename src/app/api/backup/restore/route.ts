import { restoreBackup, servicesFrom } from "@/server/backup";
import { DeviceError } from "@/server/device";
import { apiRoute, sseResponse } from "@/server/route";

// Multipart: file (a backup archive), services (JSON list). Replaces those categories on the device with
// the backup's contents and streams the device's per-category results.
export const POST = apiRoute(async (request) => {
	const form = await request.formData().catch(() => null);
	const file = form?.get("file");
	if (!(file instanceof File)) throw new DeviceError("Choose a backup file", 400);
	let services: unknown;
	try {
		services = JSON.parse(String(form?.get("services") ?? "[]"));
	} catch {
		throw new DeviceError("services must be a JSON list", 400);
	}
	return sseResponse(
		await restoreBackup(Buffer.from(await file.arrayBuffer()), await servicesFrom(services), request.signal)
	);
});
