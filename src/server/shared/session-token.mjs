// The session cookie's value: `<expiry>.<HMAC-SHA256 of "v1.<expiry>">`, keyed by SESSION_SECRET.
// Shared by the Next.js routes (session.ts) and the agent proxy in server.mjs.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "tiiny_session";

function secret() {
	const value = process.env.SESSION_SECRET;
	if (!value) throw new Error("SESSION_SECRET is not set; start the app with server.mjs");
	return value;
}

/** @param {number} expires */
const sign = (expires) => createHmac("sha256", secret()).update(`v1.${expires}`).digest("hex");

/**
 * @param {number} maxAgeSeconds
 * @returns {string}
 */
export function createSessionToken(maxAgeSeconds) {
	const expires = Math.floor(Date.now() / 1000) + maxAgeSeconds;
	return `${expires}.${sign(expires)}`;
}

/**
 * @param {string | undefined} token
 * @returns {boolean}
 */
export function isValidSessionToken(token) {
	const [expiresText, mac] = token?.split(".") ?? [];
	const expires = Number(expiresText);
	if (!mac || !Number.isInteger(expires) || expires < Date.now() / 1000) return false;
	const expected = Buffer.from(sign(expires));
	const given = Buffer.from(mac);
	return given.length === expected.length && timingSafeEqual(given, expected);
}
