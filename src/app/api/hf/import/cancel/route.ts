import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

export const POST = apiRoute(async (request) => {
	let body: { importId?: unknown } = {};
	try {
		body = (await request.json()) as { importId?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { importId } = body;
	if (typeof importId !== "string" || !/^imp_\w+$/.test(importId)) throw new DeviceError("importId is required", 400);
	const result = await deviceJson<{ success: boolean; import_status: string }>(
		`/api/v1/models/import/${importId}/cancel`,
		{ method: "POST" }
	);
	return NextResponse.json({ success: result.success, status: result.import_status });
});
