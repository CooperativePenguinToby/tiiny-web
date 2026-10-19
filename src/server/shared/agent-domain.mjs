// Agent subdomains: `https://<service id>.<AGENT_DOMAIN>`. Shared by the Next.js routes and the agent
// proxy in server.mjs; kept apart from agent-proxy.mjs so the routes do not bundle the proxy itself.

// Where the agent host exchanges a one-time link from the web UI for its own session cookie.
export const HANDOFF_PATH = "/.tiiny/handoff";

/**
The domain whose subdomains name the agents, e.g. `tiiny.test`, or null when not configured.
@returns {string | null}
*/
export function agentDomain() {
	const domain = process.env.AGENT_DOMAIN?.trim()
		.toLowerCase()
		.replaceAll(/^\.+|\.+$/g, "");
	return domain || null;
}
