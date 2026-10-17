import { NextResponse } from "next/server";
import { endSession } from "@/server/session";

export async function POST(): Promise<Response> {
	await endSession();
	return NextResponse.json({ ok: true });
}
