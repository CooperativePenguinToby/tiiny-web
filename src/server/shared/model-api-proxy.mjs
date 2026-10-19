// HTTPS front doors for the device's model APIs (see model-api.mjs for the three ways in). They need no
// sign-in: whatever credentials the client sends (`Authorization: Bearer …` or `x-api-key`) go to the
// device as they are, and the device decides. Only the model API paths are forwarded; the rest of the
// device's API is the web UI's to use.
import { createServer } from "node:https";

import httpProxy from "http-proxy";

import { resolveDeviceTarget } from "./device-target.mjs";
import { translate } from "./messages.mjs";
import { apiHost, apiPort, isModelApiPath, MODEL_API_PATHS, PROXY_PREFIX } from "./model-api.mjs";

/**
@type {{ proxy: import("http-proxy") | null }}
*/
const shared = { proxy: null };

/**
An error in the shape the client's API uses (Ollama's is a plain string).
@param {import("node:http").IncomingMessage} request @param {import("node:http").ServerResponse} response
@param {number} status @param {string} key @param {Record<string, string>} [values]
*/
function fail(request, response, status, key, values) {
	const message = translate(request, undefined, key, values);
	const ollama = (request.url ?? "").startsWith("/api/");
	response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
	response.end(JSON.stringify({ error: ollama ? message : { type: "proxy_error", message } }));
}

// Created on first use. Streams pass through unbuffered and with no time limit: the device queues
// inference per model and a reply can take minutes to start.
function modelApiProxy() {
	if (shared.proxy) return shared.proxy;
	const proxy = httpProxy.createProxyServer({ changeOrigin: true });
	proxy.on("error", (error, request, response) => {
		if (response && "writeHead" in response && !response.headersSent) {
			fail(request, response, 502, "errors.modelApi.noAnswer", { reason: error.message });
		} else {
			response?.destroy();
		}
	});
	shared.proxy = proxy;
	return proxy;
}

/**
Sends the request to the device at `pathname`, or answers 404 when no format serves it there.
@param {import("node:http").IncomingMessage} request @param {import("node:http").ServerResponse} response
@param {string} pathname @param {keyof typeof MODEL_API_PATHS} [format]
*/
function forward(request, response, pathname, format) {
	const device = resolveDeviceTarget();
	if (!device) {
		fail(request, response, 503, "errors.device.notConfiguredShort");
		return;
	}
	if (!isModelApiPath(pathname, format)) {
		fail(request, response, 404, "errors.modelApi.notFound", { path: pathname });
		return;
	}
	const query = (request.url ?? "").includes("?") ? (request.url ?? "").slice((request.url ?? "").indexOf("?")) : "";
	request.url = `${pathname}${query}`;
	// The web UI's cookies are no business of the device.
	delete request.headers.cookie;
	modelApiProxy().web(request, response, { target: device.baseUrl });
}

/**
@param {import("node:http").IncomingMessage} request
*/
const pathOf = (request) => (request.url ?? "/").split("?", 1)[0];

/**
Serves a request to the app's own port that is for the model APIs: one to `api.<AGENT_DOMAIN>`, or one
under `/proxy/<format>/`. Returns false when it belongs to the web UI.
@param {import("node:http").IncomingMessage} request @param {import("node:http").ServerResponse} response
@returns {boolean}
*/
export function handleModelApiRequest(request, response) {
	const pathname = pathOf(request);
	const hostname = (request.headers.host ?? "").replace(/:\d+$/, "").toLowerCase();
	if (hostname === apiHost()) {
		forward(request, response, pathname);
		return true;
	}
	for (const format of /** @type {(keyof typeof MODEL_API_PATHS)[]} */ (Object.keys(MODEL_API_PATHS))) {
		const prefix = `${PROXY_PREFIX}/${format}`;
		if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
			forward(request, response, pathname.slice(prefix.length) || "/", format);
			return true;
		}
	}
	return false;
}

/**
Opens the HTTPS listener on API_PORT.
@param {{ tls: { cert: Buffer; key: Buffer }; host: string }} options
*/
export function startModelApiProxy({ tls, host }) {
	const port = apiPort();
	const server = createServer({ cert: tls.cert, key: tls.key }, (request, response) =>
		forward(request, response, pathOf(request))
	);
	server.on("error", (error) => console.error(`tiiny-web: model API proxy on port ${port}: ${error.message}`));
	server.listen(port, host, () => console.log(`tiiny-web: model APIs on https://${host}:${port}`));
}
