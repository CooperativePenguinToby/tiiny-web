import { NextResponse } from "next/server";
import { isCorrectPassword, startSession } from "@/server/session";

import { getT } from "@/i18n/server";

const FAILURE_DELAY_MS = 1000;

export async function POST(request: Request): Promise<Response> {
	let body: { password?: unknown } = {};
	try {
		body = (await request.json()) as { password?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { password } = body;
	if (typeof password !== "string" || !isCorrectPassword(password)) {
		await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
		return NextResponse.json({ error: (await getT())("errors.incorrectPassword") }, { status: 401 });
	}
	await startSession();
	return NextResponse.json({ ok: true });
}
