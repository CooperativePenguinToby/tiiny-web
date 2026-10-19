// The device's model APIs (OpenAI-compatible, Anthropic, Ollama) over HTTPS. Shared by the Next.js
// routes and the proxy in server.mjs; kept apart from model-api-proxy.mjs so the routes do not bundle
// the proxy itself. Each API is reachable three ways, all forwarding to the device's main host:
// - an HTTPS listener on API_PORT, laid out as the device lays them out;
// - when AGENT_DOMAIN is set, `https://api.<AGENT_DOMAIN>` on the app's own port, laid out the same;
// - `https://<app host>/proxy/<format>/…` on the app's own port, one prefix per format.
import { agentDomain } from "./agent-domain.mjs";

export const API_SUBDOMAIN = "api";
export const PROXY_PREFIX = "/proxy";

/**
The paths each format serves on the device. A path ending in `/*` also covers what is below it.
@type {Record<"openai" | "anthropic" | "ollama", string[]>}
*/
export const MODEL_API_PATHS = {
	openai: [
		"/v1/models",
		"/v1/models/*",
		"/v1/chat/completions",
		"/v1/completions",
		"/v1/responses",
		"/v1/embeddings",
		"/v1/rerank",
		"/v1/audio/speech",
		"/v1/audio/transcriptions",
		"/v1/images/generations",
	],
	anthropic: ["/v1/models", "/v1/models/*", "/v1/messages", "/v1/messages/count_tokens"],
	ollama: ["/api/chat", "/api/generate", "/api/embed", "/api/tags", "/api/ps"],
};

/**
The port of the HTTPS listener for the model APIs.
@returns {number}
*/
export function apiPort() {
	return Number(process.env.API_PORT ?? 11_443);
}

/**
`api.<AGENT_DOMAIN>`, or null when AGENT_DOMAIN is not set.
@returns {string | null}
*/
export function apiHost() {
	const domain = agentDomain();
	return domain ? `${API_SUBDOMAIN}.${domain}` : null;
}

/**
Whether a format (or, without one, any format) serves this path.
@param {string} pathname @param {keyof typeof MODEL_API_PATHS} [format]
@returns {boolean}
*/
export function isModelApiPath(pathname, format) {
	// Dot segments, encoded slashes and backslashes could step out of an allowed path on the device.
	if (new URL(pathname, "http://proxy").pathname !== pathname || /%2f|%5c|\\/i.test(pathname)) return false;
	const patterns = format ? MODEL_API_PATHS[format] : Object.values(MODEL_API_PATHS).flat();
	return patterns.some((pattern) =>
		pattern.endsWith("/*")
			? pathname.startsWith(pattern.slice(0, -1)) && pathname.length > pattern.length - 1
			: pathname === pattern
	);
}
