// The session cookie's value: `<expiry>.<HMAC-SHA256 of "v1.<expiry>">`, keyed by SESSION_SECRET.
// Shared by the Next.js routes (session.ts) and the agent proxy in server.mjs.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "tiiny_session";

function secret() {
	const value = process.env.SESSION_SECRET;
	if (!value) throw new Error("SESSION_SECRET is not set; start the app with server.mjs");
	return value;
}

/**
@param {number} expires
*/
const sign = (expires) => createHmac("sha256", secret()).update(`v1.${expires}`).digest("hex");

/**
@param {number} maxAgeSeconds
@returns {string}
*/
export function createSessionToken(maxAgeSeconds) {
	const expires = Math.floor(Date.now() / 1000) + maxAgeSeconds;
	return `${expires}.${sign(expires)}`;
}

/**
@param {string | undefined} token
@returns {boolean}
*/
export function isValidSessionToken(token) {
	const [expiresText, mac] = token?.split(".") ?? [];
	const expires = Number(expiresText);
	if (!mac || !Number.isSafeInteger(expires) || expires < Date.now() / 1000) return false;
	const expected = Buffer.from(sign(expires));
	const given = Buffer.from(mac);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

// A one-time link from the web UI to an agent's subdomain (AGENT_DOMAIN):
// `h1.<expiry>.<nonce>.<service id>.<HMAC>`. The nonce keeps links issued within the same second distinct.
// The UI's session cookie cannot reach another host, so the agent host exchanges this for its own.
const HANDOFF_PATTERN = /^h1\.(\d+)\.([0-9a-f]{32})\.([a-z0-9-]+)\.([0-9a-f]{64})$/;

/**
@param {number} expires @param {string} nonce @param {string} serviceId
*/
const signHandoff = (expires, nonce, serviceId) =>
	createHmac("sha256", secret()).update(`h1.${expires}.${nonce}.${serviceId}`).digest("hex");

/**
@param {string} serviceId
@returns {string}
*/
export function createHandoffToken(serviceId) {
	const expires = Math.floor(Date.now() / 1000) + 60;
	const nonce = randomBytes(16).toString("hex");
	return `h1.${expires}.${nonce}.${serviceId}.${signHandoff(expires, nonce, serviceId)}`;
}

/**
Returns the service id the token was issued for, or null when it is invalid or expired.
@param {string} token
@returns {{ serviceId: string; expires: number } | null}
*/
export function readHandoffToken(token) {
	const match = HANDOFF_PATTERN.exec(token);
	if (!match) return null;
	const [, expiresText, nonce, serviceId, mac] = match;
	const expires = Number(expiresText);
	if (expires < Date.now() / 1000) return null;
	const expected = Buffer.from(signHandoff(expires, nonce, serviceId));
	const given = Buffer.from(mac);
	return given.length === expected.length && timingSafeEqual(given, expected) ? { serviceId, expires } : null;
}
