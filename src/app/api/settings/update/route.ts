import { NextResponse } from "next/server";
import { DeviceError } from "@/server/device";
import { apiRoute } from "@/server/route";
import { checkForUpdate, installUpdate, prepareUpdate, updateStatus } from "@/server/upgrade";

// GET: current upgrade state (polled while an update downloads or installs).
export const GET = apiRoute(async () => NextResponse.json(await updateStatus()));

// POST { action: "check" | "download" | "install" }.
export const POST = apiRoute(async (request) => {
	const { action } = (await request.json().catch(() => ({}))) as { action?: unknown };
	switch (action) {
		case "check": {
			return NextResponse.json(await checkForUpdate());
		}
		case "download": {
			const update = await checkForUpdate();
			if (!update.updateAvailable) throw new DeviceError("TiinyOS is up to date", 409);
			await prepareUpdate(update.availableVersion);
			return NextResponse.json(await updateStatus());
		}
		case "install": {
			const status = await updateStatus();
			if (status.state !== "prepared") throw new DeviceError("No downloaded update is ready to install", 409);
			await installUpdate();
			return NextResponse.json(await updateStatus());
		}
		default: {
			throw new DeviceError("Unknown update action", 400);
		}
	}
});
