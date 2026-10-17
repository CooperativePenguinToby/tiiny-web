import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

// Single-admin session: the cookie carries its expiry plus an HMAC over it, keyed by
// SESSION_SECRET (persisted by server.mjs). Rotating the secret signs everyone out.

export const SESSION_COOKIE = "tiiny_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function secret(): string {
	const value = process.env.SESSION_SECRET;
	if (!value) throw new Error("SESSION_SECRET is not set; start the app with server.mjs");
	return value;
}

const sign = (expires: number): string => createHmac("sha256", secret()).update(`v1.${expires}`).digest("hex");

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

export function passwordMatches(candidate: string): boolean {
	const expected = process.env.ADMIN_PASSWORD;
	return Boolean(expected) && timingSafeEqual(digest(candidate), digest(expected!));
}

export async function startSession(): Promise<void> {
	const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
	const jar = await cookies();
	jar.set(SESSION_COOKIE, `${expires}.${sign(expires)}`, {
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
	const value = jar.get(SESSION_COOKIE)?.value;
	const [expiresText, mac] = value?.split(".") ?? [];
	const expires = Number(expiresText);
	if (!mac || !Number.isInteger(expires) || expires < Date.now() / 1000) return false;
	const expected = Buffer.from(sign(expires));
	const given = Buffer.from(mac);
	return given.length === expected.length && timingSafeEqual(given, expected);
}
