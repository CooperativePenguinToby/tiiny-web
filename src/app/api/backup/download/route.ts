import { exportBackup, servicesFrom } from "@/server/backup";
import { apiRoute } from "@/server/route";

const stamp = (date: Date): string =>
	`${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;

// { services } → the backup archive, named as TiinyOS names it. Categories the device could not back up
// are listed in X-Backup-Failures.
export const POST = apiRoute(async (request) => {
	const { services } = (await request.json().catch(() => ({}))) as { services?: unknown };
	const { archive, failures } = await exportBackup(await servicesFrom(services));
	return new Response(new Uint8Array(archive), {
		headers: {
			"Content-Type": "application/zip",
			"Content-Disposition": `attachment; filename="tiiny.${stamp(new Date())}.zip"`,
			"Content-Length": String(archive.length),
			"X-Backup-Failures": encodeURIComponent(JSON.stringify(failures)),
		},
	});
});
