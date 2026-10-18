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

/** @typedef {{ port: number; serviceId: string; listening: boolean; error: string | null }} ProxyState */

/** @type {Map<number, ProxyState>} */
const states = new Map();
/** @type {Map<number, import("node:https").Server>} */
const servers = new Map();
/** Where each proxied request came in, for rewriting redirects. @type {WeakMap<object, { publicHost: string; deviceHost: string }>} */
const origins = new WeakMap();
globalThis.tiinyAgentProxies = states;

/** @param {string | undefined} header */
function parseCookies(header) {
	/** @type {Record<string, string>} */
	const cookies = {};
	for (const part of (header ?? "").split(";")) {
		const index = part.indexOf("=");
		if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
	}
	return cookies;
}

/** Removes the wrapper's own session cookie so the agent never sees it. @param {string | undefined} header */
function withoutSessionCookie(header) {
	return (header ?? "")
		.split(";")
		.filter((part) => part.trim() && !part.trim().startsWith(`${SESSION_COOKIE}=`))
		.join(";")
		.trim();
}

/** @param {string} serviceId */
export const agentVirtualHost = (serviceId) => `${serviceId}.agent.tiiny.local`;

/** @param {import("node:http").IncomingMessage} req */
function authorized(req) {
	return isValidSessionToken(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
}

/**
 * Points a browser request at the agent's virtual host on the device.
 * @param {import("node:http").IncomingMessage} req @param {string} serviceId @param {string} deviceHost
 */
function retarget(req, serviceId, deviceHost) {
	const virtualHost = agentVirtualHost(serviceId);
	origins.set(req, { publicHost: req.headers.host ?? "", deviceHost });
	req.headers.host = virtualHost;
	if (req.headers.origin) req.headers.origin = `http://${virtualHost}`;
	const cookie = withoutSessionCookie(req.headers.cookie);
	if (cookie) req.headers.cookie = cookie;
	else delete req.headers.cookie;
}

/**
 * @param {{ tls: { cert: Buffer; key: Buffer }; host: string; appPort: number }} options
 */
export function startAgentProxies({ tls, host, appPort }) {
	const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });
	// Redirects the agent sends to its virtual host (or the device) go back to this listener instead.
	proxy.on("proxyRes", (proxyRes, req) => {
		const location = proxyRes.headers.location;
		const origin = origins.get(req);
		if (!location || !origin) return;
		try {
			const url = new URL(location);
			if (url.hostname.endsWith(".agent.tiiny.local") || url.hostname === origin.deviceHost) {
				proxyRes.headers.location = `https://${origin.publicHost}${url.pathname}${url.search}${url.hash}`;
			}
		} catch {
			// relative redirect: already correct
		}
	});
	proxy.on("error", (error, _req, res) => {
		const message = `The agent did not answer (${error.message}). It may be stopped.`;
		if (res && "writeHead" in res && !res.headersSent) {
			res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
			res.end(message);
		} else {
			res?.destroy();
		}
	});

	/** @param {number} port @param {string} serviceId @param {string} deviceBaseUrl */
	function open(port, serviceId, deviceBaseUrl) {
		const target = deviceBaseUrl;
		const deviceHost = new URL(deviceBaseUrl).hostname;
		const server = createServer({ cert: tls.cert, key: tls.key }, (req, res) => {
			if (!authorized(req)) {
				const signIn = new URL(
					`https://${(req.headers.host ?? "localhost").replace(/:\d+$/, "")}:${appPort}/auth/sign-in`
				);
				res.writeHead(302, { location: signIn.toString() });
				res.end();
				return;
			}
			retarget(req, serviceId, deviceHost);
			proxy.web(req, res, { target });
		});
		server.on("upgrade", (req, socket, head) => {
			if (!authorized(req)) {
				socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
				return;
			}
			retarget(req, serviceId, deviceHost);
			proxy.ws(req, socket, head, { target });
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
		/** @type {Map<number, string>} */
		const wanted = new Map();
		for (const service of services) {
			for (const { host_port: port, protocol } of service.ports ?? []) {
				if (protocol === "tcp" && Number.isInteger(port) && port !== appPort) wanted.set(port, service.id);
			}
		}
		for (const [port, serviceId] of wanted) if (!servers.has(port)) open(port, serviceId, device.baseUrl);
		for (const [port, server] of servers) {
			if (!wanted.has(port)) {
				server.close();
				servers.delete(port);
				states.delete(port);
			}
		}
	}

	void refresh();
	setInterval(() => void refresh(), REFRESH_MS).unref();
}
