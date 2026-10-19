// HTTPS front doors for the device's web agents. The device's gateway (port 80) serves every agent's
// web UI under the virtual host `<service id>.agent.tiiny.local`, whether the agent listens on the
// device's LAN side or only on its loopback, and with no login. Each installed agent is reachable two
// ways, both forwarding to that virtual host and only for browsers holding a valid wrapper session:
// - an HTTPS listener on the agent's port number here;
// - when AGENT_DOMAIN is set, `https://<service id>.<AGENT_DOMAIN>` on the app's own port, entered
//   through a one-time handoff link from the web UI (its session cookie cannot reach another host).
// Listener state is published on globalThis so the agents API route (same process) can report it.
import { createServer } from "node:https";

import httpProxy from "http-proxy";

import { agentDomain, HANDOFF_PATH } from "./agent-domain.mjs";
import { resolveDeviceTarget } from "./device-target.mjs";
import { translate } from "./messages.mjs";
import { createSessionToken, isValidSessionToken, readHandoffToken, SESSION_COOKIE } from "./session-token.mjs";

const REFRESH_MS = 30_000;
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

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
/**
Installed agents that have a web UI, by service id, for routing their subdomains. @type {Set<string>}
*/
const agentIds = new Set();
/**
Handoff tokens already exchanged, until they expire. @type {Map<string, number>}
*/
const usedHandoffs = new Map();
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
The installed agent a request's Host names under AGENT_DOMAIN, if any.
@param {import("node:http").IncomingMessage} request
@returns {string | null}
*/
function agentForHost(request) {
	const domain = agentDomain();
	if (!domain) return null;
	const hostname = (request.headers.host ?? "").replace(/:\d+$/, "").toLowerCase();
	if (!hostname.endsWith(`.${domain}`)) return null;
	const label = hostname.slice(0, -(domain.length + 1));
	return agentIds.has(label) ? label : null;
}

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
@type {{ proxy: import("http-proxy") | null }}
*/
const shared = { proxy: null };

// The forwarder shared by the port listeners and the subdomain routes, created on first use.
function agentProxy() {
	if (shared.proxy) return shared.proxy;
	const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });
	// Redirects the agent sends to its virtual host (or the device) go back to where the request came in.
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
	proxy.on("error", (error, request, response) => {
		const message = translateFor(request, "errors.agentProxy.noAnswer", { reason: error.message });
		if (response && "writeHead" in response && !response.headersSent) {
			response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
			response.end(message);
		} else {
			response?.destroy();
		}
	});
	shared.proxy = proxy;
	return proxy;
}

/**
A message in the request's language. On an agent's own host the browser sends no "lang" cookie (it is
set on the web UI's host), so Accept-Language decides there.
@param {import("node:http").IncomingMessage} request @param {string} key @param {Record<string, string>} [values]
*/
function translateFor(request, key, values) {
	return translate(request, parseCookies(request.headers.cookie).lang, key, values);
}

/**
@param {import("node:http").ServerResponse} response @param {string} message
*/
function refuse(response, message) {
	response.writeHead(401, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
	response.end(message);
}

/**
Exchanges a handoff link for a session cookie on this agent's host, then opens the agent.
@param {import("node:http").IncomingMessage} request @param {import("node:http").ServerResponse} response
@param {string} serviceId
*/
function handOff(request, response, serviceId) {
	const now = Date.now() / 1000;
	for (const [token, expires] of usedHandoffs) if (expires < now) usedHandoffs.delete(token);
	const token = new URL(request.url ?? "/", "https://agent").searchParams.get("token") ?? "";
	const handoff = readHandoffToken(token);
	if (!handoff || handoff.serviceId !== serviceId || usedHandoffs.has(token)) {
		refuse(response, translateFor(request, "errors.agentProxy.linkExpired"));
		return;
	}
	usedHandoffs.set(token, handoff.expires);
	// Lax, not Strict: the handoff arrives from the web UI's host, and the redirect below must carry it.
	const cookie = `${SESSION_COOKIE}=${createSessionToken(SESSION_MAX_AGE_SECONDS)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
	response.writeHead(302, { location: "/", "set-cookie": cookie, "cache-control": "no-store" });
	response.end();
}

/**
Serves a request addressed to `<service id>.<AGENT_DOMAIN>`. Returns false when the request is not for
an agent (it belongs to the web UI).
@param {import("node:http").IncomingMessage} request @param {import("node:http").ServerResponse} response
@returns {boolean}
*/
export function handleAgentRequest(request, response) {
	const serviceId = agentForHost(request);
	const device = serviceId ? resolveDeviceTarget() : null;
	if (!serviceId || !device) return false;
	if ((request.url ?? "").split("?", 1)[0] === HANDOFF_PATH) {
		handOff(request, response, serviceId);
		return true;
	}
	if (!authorized(request)) {
		refuse(response, translateFor(request, "errors.agentProxy.signIn"));
		return true;
	}
	retarget(request, serviceId, new URL(device.baseUrl).hostname);
	agentProxy().web(request, response, { target: device.baseUrl });
	return true;
}

/**
The websocket counterpart of handleAgentRequest.
@param {import("node:http").IncomingMessage} request @param {import("node:stream").Duplex} socket
@param {Buffer} head
@returns {boolean}
*/
export function handleAgentUpgrade(request, socket, head) {
	const serviceId = agentForHost(request);
	const device = serviceId ? resolveDeviceTarget() : null;
	if (!serviceId || !device) return false;
	if (!authorized(request)) {
		socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
		return true;
	}
	retarget(request, serviceId, new URL(device.baseUrl).hostname);
	agentProxy().ws(request, socket, head, { target: device.baseUrl });
	return true;
}

/**
@param {{ tls: { cert: Buffer; key: Buffer }; host: string; appPort: number }} options
*/
export function startAgentProxies({ tls, host, appPort }) {
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
			agentProxy().web(request, response, { target });
		});
		server.on("upgrade", (request, socket, head) => {
			if (!authorized(request)) {
				socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
				return;
			}
			retarget(request, serviceId, deviceHost);
			agentProxy().ws(request, socket, head, { target });
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
		agentIds.clear();
		for (const service of services) {
			const ports = service.ports ?? [];
			if (ports.some(({ protocol }) => protocol === "tcp")) agentIds.add(String(service.id).toLowerCase());
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
