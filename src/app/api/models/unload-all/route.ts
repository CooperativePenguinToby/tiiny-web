import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

// Releases every loaded model from the NPU (including ones other apps are using).
export const POST = apiRoute(async () => {
	const result = await deviceJson<{ message?: string }>("/api/v1/models/unload_all", { method: "POST", slow: true });
	return NextResponse.json({ message: result.message ?? "All models unloaded" });
});
