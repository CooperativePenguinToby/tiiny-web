import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

export const POST = apiRoute(async () => {
	const result = await deviceJson<{ message?: string }>("/api/v1/sys/shutdown/", { method: "POST" });
	return NextResponse.json({ message: result.message ?? "Shutting down" });
});
