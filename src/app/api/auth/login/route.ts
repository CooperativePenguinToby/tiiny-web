import { NextResponse } from "next/server";
import { passwordMatches, startSession } from "@/server/session";

const FAILURE_DELAY_MS = 1000;

export async function POST(request: Request): Promise<Response> {
	const { password } = (await request.json().catch(() => ({}))) as { password?: unknown };
	if (typeof password !== "string" || !passwordMatches(password)) {
		await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
		return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
	}
	await startSession();
	return NextResponse.json({ ok: true });
}
