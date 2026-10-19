import { NextResponse } from "next/server";
import { DeviceError } from "@/server/device";
import { apiRoute } from "@/server/route";
import { checkForUpdate, installUpdate, prepareUpdate, updateStatus } from "@/server/upgrade";

// GET: current upgrade state (polled while an update downloads or installs).
export const GET = apiRoute(async () => NextResponse.json(await updateStatus()));

// POST { action: "check" | "download" | "install" }.
export const POST = apiRoute(async (request) => {
	let body: { action?: unknown } = {};
	try {
		body = (await request.json()) as { action?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { action } = body;
	switch (action) {
		case "check": {
			return NextResponse.json(await checkForUpdate());
		}
		case "download": {
			const update = await checkForUpdate();
			if (!update.updateAvailable) throw new DeviceError("errors.update.upToDate", 409);
			await prepareUpdate(update.availableVersion);
			return NextResponse.json(await updateStatus());
		}
		case "install": {
			const status = await updateStatus();
			if (status.state !== "prepared") throw new DeviceError("errors.update.notReady", 409);
			await installUpdate();
			return NextResponse.json(await updateStatus());
		}
		default: {
			throw new DeviceError("errors.update.unknownAction", 400);
		}
	}
});
