import { createHash, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { createSessionToken, isValidSessionToken, SESSION_COOKIE } from "./shared/session-token.mjs";

// Single-admin session: the cookie carries its expiry plus an HMAC over it, keyed by
// SESSION_SECRET (persisted by server.mjs). Rotating the secret signs everyone out.

const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

export function passwordMatches(candidate: string): boolean {
	const expected = process.env.ADMIN_PASSWORD;
	return Boolean(expected) && timingSafeEqual(digest(candidate), digest(expected!));
}

export async function startSession(): Promise<void> {
	const jar = await cookies();
	jar.set(SESSION_COOKIE, createSessionToken(MAX_AGE_SECONDS), {
		httpOnly: true,
		secure: true,
		sameSite: "strict",
		path: "/",
		maxAge: MAX_AGE_SECONDS,
	});
}

export async function endSession(): Promise<void> {
	const jar = await cookies();
	jar.delete(SESSION_COOKIE);
}

export async function hasSession(): Promise<boolean> {
	const jar = await cookies();
	return isValidSessionToken(jar.get(SESSION_COOKIE)?.value);
}
