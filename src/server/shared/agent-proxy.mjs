// HTTPS front doors for the device's web agents. The device's gateway (port 80) serves every agent's
// web UI under the virtual host `<service id>.agent.tiiny.local`, whether the agent listens on the
// device's LAN side or only on its loopback, and with no login. For each installed agent this opens an
// HTTPS listener on the agent's port number here and forwards to that virtual host, but only for
// browsers holding a valid wrapper session. Listener state is published on globalThis so the agents
// API route (same process) can report it.
import { createServer } from "node:https";

import httpProxy from "http-proxy";

import { resolveDeviceTarget } from "./device-target.mjs";
import { isValidSessionToken, SESSION_COOKIE } from "./session-token.mjs";

const REFRESH_MS = 30_000;

/**
@typedef {{ port: number; serviceId: string; listening: boolean; error: string | null }} ProxyState
*/

/**
@type {Map<number, ProxyState>}
*/
const states = new Map();
/**
@type {Map<number, import("node:https").Server>}
*/
const servers = new Map();
/**
Where each proxied request came in, for rewriting redirects. @type {WeakMap<object, { publicHost: string; deviceHost: string }>}
*/
const origins = new WeakMap();
// eslint-disable-next-line unicorn/no-global-object-property-assignment -- the agents API route reads this from Next's separately bundled server code; the global is the only channel shared with this custom server
globalThis.tiinyAgentProxies = states;

/**
@param {string | undefined} header
*/
function parseCookies(header = "") {
	/**
	@type {Record<string, string>}
	*/
	const cookies = {};
	for (const part of header.split(";")) {
		const index = part.indexOf("=");
		if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
	}
	return cookies;
}

/**
Removes the wrapper's own session cookie so the agent never sees it. @param {string | undefined} header
*/
function withoutSessionCookie(header = "") {
	return header
		.split(";")
		.filter((part) => part.trim() && !part.trim().startsWith(`${SESSION_COOKIE}=`))
		.join(";")
		.trim();
}

/**
@param {string} serviceId
*/
export const agentVirtualHost = (serviceId) => `${serviceId}.agent.tiiny.local`;

/**
@param {import("node:http").IncomingMessage} request
*/
function authorized(request) {
	return isValidSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE]);
}

/**
Points a browser request at the agent's virtual host on the device.
@param {import("node:http").IncomingMessage} request @param {string} serviceId @param {string} deviceHost
*/
function retarget(request, serviceId, deviceHost) {
	const virtualHost = agentVirtualHost(serviceId);
	origins.set(request, { publicHost: request.headers.host ?? "", deviceHost });
	request.headers.host = virtualHost;
	if (request.headers.origin) request.headers.origin = `http://${virtualHost}`;
	const cookie = withoutSessionCookie(request.headers.cookie);
	if (cookie) request.headers.cookie = cookie;
	else delete request.headers.cookie;
}

/**
@param {{ tls: { cert: Buffer; key: Buffer }; host: string; appPort: number }} options
*/
export function startAgentProxies({ tls, host, appPort }) {
	const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });
	// Redirects the agent sends to its virtual host (or the device) go back to this listener instead.
	proxy.on("proxyRes", (proxyResponse, request) => {
		const location = proxyResponse.headers.location;
		const origin = origins.get(request);
		if (!location || !origin) return;
		try {
			const url = new URL(location);
			if (url.hostname.endsWith(".agent.tiiny.local") || url.hostname === origin.deviceHost) {
				proxyResponse.headers.location = `https://${origin.publicHost}${url.pathname}${url.search}${url.hash}`;
			}
		} catch {
			// relative redirect: already correct
		}
	});
	proxy.on("error", (error, _request, response) => {
		const message = `The agent did not answer (${error.message}). It may be stopped.`;
		if (response && "writeHead" in response && !response.headersSent) {
			response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
			response.end(message);
		} else {
			response?.destroy();
		}
	});

	/**
	@param {number} port @param {string} serviceId @param {string} deviceBaseUrl
	*/
	function open(port, serviceId, deviceBaseUrl) {
		const target = deviceBaseUrl;
		const deviceHost = new URL(deviceBaseUrl).hostname;
		const server = createServer({ cert: tls.cert, key: tls.key }, (request, response) => {
			if (!authorized(request)) {
				const signIn = new URL(
					`https://${(request.headers.host ?? "localhost").replace(/:\d+$/, "")}:${appPort}/auth/sign-in`
				);
				response.writeHead(302, { location: signIn.href });
				response.end();
				return;
			}
			retarget(request, serviceId, deviceHost);
			proxy.web(request, response, { target });
		});
		server.on("upgrade", (request, socket, head) => {
			if (!authorized(request)) {
				socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
				return;
			}
			retarget(request, serviceId, deviceHost);
			proxy.ws(request, socket, head, { target });
		});
		const state = { port, serviceId, listening: false, error: null };
		states.set(port, state);
		servers.set(port, server);
		server.on("error", (error) => {
			state.listening = false;
			state.error = error.message;
			console.error(`tiiny-web: agent proxy for ${serviceId} on port ${port}: ${error.message}`);
		});
		server.listen(port, host, () => {
			state.listening = true;
			console.log(`tiiny-web: agent proxy https://${host}:${port} -> ${target} (Host: ${agentVirtualHost(serviceId)})`);
		});
	}

	async function refresh() {
		const device = resolveDeviceTarget();
		if (!device) return;
		let services;
		try {
			const response = await fetch(`${device.baseUrl}/api/services`, {
				headers: { Authorization: `Bearer ${device.authKey}` },
				signal: AbortSignal.timeout(15_000),
			});
			if (!response.ok) return;
			services = await response.json();
		} catch {
			return; // device unreachable: keep the current listeners
		}
		/**
		@type {Map<number, string>}
		*/
		const wanted = new Map();
		for (const service of services) {
			const ports = service.ports ?? [];
			for (const { host_port: port, protocol } of ports) {
				if (port !== appPort && protocol === "tcp" && Number.isSafeInteger(port)) wanted.set(port, service.id);
			}
		}
		for (const [port, serviceId] of wanted) if (!servers.has(port)) open(port, serviceId, device.baseUrl);
		for (const [port, server] of servers) {
			if (wanted.has(port)) {
				continue;
			}

			server.close();
			servers.delete(port);
			states.delete(port);
		}
	}

	void refresh();
	setInterval(() => void refresh(), REFRESH_MS).unref();
}
