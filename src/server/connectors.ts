import type { ParseKeys, TFunction } from "i18next";

import type { Connector, ConnectorKey, McpServer, McpTool } from "@/types/device";

import { DeviceError, deviceId, deviceJson } from "./device";

// Connectors run in the device's connector service. Google and Microsoft accounts sign in through Tiiny's
// cloud (any browser can open the sign-in page); the other services take tokens or an app login.
const OAUTH: Partial<Record<ConnectorKey, { path: string; name: string; category: Connector["category"] }>> = {
	gmail: { path: "gmail", name: "Gmail", category: "email" },
	"google-calendar": { path: "calendar", name: "Google Calendar", category: "calendar" },
	"outlook-mail": { path: "outlook", name: "Outlook Mail", category: "email" },
	"outlook-calendar": { path: "outlook/calendar", name: "Outlook Calendar", category: "calendar" },
};
// A channel's name is a brand name or, where it has words in it, a translation key.
const CHANNELS: Partial<
	Record<ConnectorKey, { channel: string; name: string | { key: ParseKeys }; category: Connector["category"] }>
> = {
	email: { channel: "email", name: { key: "server.connectors.names.email" }, category: "email" },
	telegram: { channel: "telegram", name: { key: "server.connectors.names.telegram" }, category: "messaging" },
	discord: { channel: "discord", name: { key: "server.connectors.names.discord" }, category: "messaging" },
	x: { channel: "x", name: "X (Twitter)", category: "messaging" },
	whatsapp: { channel: "whatsapp", name: "WhatsApp", category: "messaging" },
};

export const CONNECTOR_KEYS = [...Object.keys(OAUTH), ...Object.keys(CHANNELS)] as ConnectorKey[];

export function connectorKeyFrom(value: unknown): ConnectorKey {
	if (typeof value !== "string" || !CONNECTOR_KEYS.includes(value as ConnectorKey)) {
		throw new DeviceError("errors.connectors.unknown", 400);
	}
	return value as ConnectorKey;
}

// The account connectors identify the owner by the device serial.
async function connector<T>(pathname: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
	return deviceJson<T>(pathname, { ...init, service: "connector", headers: { "x-user-id": await deviceId() } });
}

interface OAuthStatus {
	connected: boolean;
	email_address: string | null;
}
interface ChannelStatus {
	connected: boolean;
	running: boolean;
	detail: string;
}

export async function listConnectors(t: TFunction): Promise<Connector[]> {
	const [status, oauth] = await Promise.all([
		connector<{ channels: Record<string, ChannelStatus> }>("/v1/status"),
		Promise.all(
			Object.entries(OAUTH).map(async ([key, spec]) => {
				try {
					const reply = await connector<OAuthStatus>(`/v1/${spec.path}/status`);
					return [key, reply] as const;
				} catch {
					return [key, null] as const;
				}
			})
		),
	]);
	const accounts = new Map(oauth);
	return [
		...Object.entries(OAUTH).map(([key, spec]) => {
			const reply = accounts.get(key);
			return {
				key: key as ConnectorKey,
				name: spec.name,
				category: spec.category,
				connected: reply?.connected ?? false,
				detail: reply
					? reply.connected
						? (reply.email_address ?? t("server.connectors.connected"))
						: t("server.connectors.signIn", { provider: key.startsWith("outlook") ? "Microsoft" : "Google" })
					: t("server.connectors.unavailable"),
			};
		}),
		...Object.entries(CHANNELS).map(([key, spec]) => {
			const channel = status.channels[spec.channel];
			return {
				key: key as ConnectorKey,
				name: typeof spec.name === "string" ? spec.name : t(spec.name.key),
				category: spec.category,
				connected: channel?.connected ?? false,
				detail: channel
					? channel.connected
						? t("server.connectors.connected")
						: describe(channel.detail, t)
					: t("server.connectors.unavailable"),
			};
		}),
	];
}

// The device's status details are terse ("qr", "Telegram token not configured").
const describe = (detail: string, t: TFunction): string =>
	detail === "qr" ? t("server.connectors.waitingForQr") : detail || t("server.connectors.notConnected");

// OAuth: the sign-in page to open (the device notices when sign-in completes).
export async function authUrl(key: ConnectorKey): Promise<string> {
	const spec = OAUTH[key];
	if (!spec) throw new DeviceError("errors.connectors.noAccountSignIn", 400);
	const prompt = key.startsWith("outlook") ? "?prompt=select_account" : "";
	const reply = await connector<{ url: string }>(`/v1/${spec.path}/auth-url${prompt}`);
	return reply.url;
}

interface Verdict {
	ok: boolean;
	error?: string | null;
	username?: string | null;
	qr?: string | null;
	status?: string;
}

// The device's reason when it gives one.
const failed = (verdict: Verdict, fallback: ParseKeys): never => {
	throw verdict.error
		? new DeviceError("errors.passthrough", 422, { message: verdict.error })
		: new DeviceError(fallback, 422);
};

// Connects a token, login or mail connector after the device has checked the credentials, as TiinyOS does.
export async function connect(
	key: ConnectorKey,
	input: Record<string, unknown>,
	t: TFunction
): Promise<{ detail: string; qr?: string }> {
	const text = (field: string): string => {
		const value = input[field];
		if (typeof value !== "string" || !value.trim()) throw new DeviceError("errors.request.required", 400, { field });
		return value.trim();
	};
	switch (key) {
		case "telegram": {
			const token = text("token");
			const verdict = await connector<Verdict>("/v1/telegram/check-with-token", { method: "POST", body: { token } });
			if (!verdict.ok) failed(verdict, "errors.connectors.tokenRejected");
			await connector("/v1/config/telegram", { method: "PATCH", body: { enabled: true, token } });
			return { detail: verdict.username ? `@${verdict.username}` : t("server.connectors.connected") };
		}
		case "discord": {
			const token = text("token");
			const channel = text("channel");
			const verdict = await connector<Verdict>("/v1/discord/check-with-token", {
				method: "POST",
				body: { token, channel },
			});
			if (!verdict.ok) failed(verdict, "errors.connectors.tokenRejected");
			await connector("/v1/config/discord", {
				method: "PATCH",
				body: { enabled: true, token, allow_channels: [channel] },
			});
			return { detail: verdict.username ?? t("server.connectors.connected") };
		}
		case "x": {
			const body = { auth_token: text("authToken"), ct0: text("ct0") };
			const verdict = await connector<Verdict>("/v2/x/check-with-token", { method: "POST", body });
			if (!verdict.ok) failed(verdict, "errors.connectors.xLoginRejected");
			await connector("/v1/config/x", { method: "PATCH", body: { ...body, enabled: true } });
			return { detail: verdict.username ? `@${verdict.username}` : t("server.connectors.connected") };
		}
		case "email": {
			const username = text("username");
			const password = text("password");
			const imapHost = text("imapHost");
			const smtpHost = text("smtpHost");
			const imapPort = Number(input.imapPort ?? 993);
			const smtpPort = Number(input.smtpPort ?? 587);
			const verdict = await connector<Verdict>("/v1/email/imap/verify", {
				method: "POST",
				body: { imap_username: username, imap_password: password, imap_host: imapHost, imap_port: imapPort },
			});
			if (!verdict.ok) failed(verdict, "errors.connectors.mailLoginRefused");
			await connector("/v1/config/email", {
				method: "PATCH",
				body: {
					enabled: true,
					imap_host: imapHost,
					imap_port: imapPort,
					imap_username: username,
					imap_password: password,
					imap_mailbox: "INBOX",
					imap_ssl: true,
					smtp_host: smtpHost,
					smtp_port: smtpPort,
					smtp_username: username,
					smtp_password: password,
					smtp_from: username,
					smtp_starttls: true,
					poll_interval_seconds: 60,
					allow_from: [],
				},
			});
			return { detail: username };
		}
		case "whatsapp": {
			const reply = await connector<Verdict>("/v1/whatsapp/qr", { method: "POST", body: {} });
			if (!reply.ok) failed(reply, "errors.connectors.whatsappFailed");
			return reply.qr
				? { detail: t("server.connectors.scanQr"), qr: reply.qr }
				: { detail: t("server.connectors.connected") };
		}
		default: {
			throw new DeviceError("errors.connectors.accountSignIn", 400);
		}
	}
}

// Disconnects and removes the stored credentials.
export async function disconnect(key: ConnectorKey): Promise<void> {
	const oauth = OAUTH[key];
	if (oauth) {
		await connector(`/v1/${oauth.path}/connection`, { method: "DELETE" });
		return;
	}
	switch (key) {
		case "whatsapp": {
			await connector("/v1/whatsapp/bridge/logout", { method: "POST", body: {} });
			return;
		}
		case "telegram":
		case "discord": {
			await connector(`/v1/config/channels/${key}`, { method: "PATCH", body: { token: "", enabled: false } });
			return;
		}
		case "x": {
			await connector("/v1/config/channels/x", {
				method: "PATCH",
				body: { token: "", auth_token: "", ct0: "", cookie_string: "", cookie_source: "", enabled: false },
			});
			return;
		}
		case "email": {
			await connector("/v1/config/channels/email", {
				method: "PATCH",
				body: {
					smtp_host: "",
					smtp_username: "",
					smtp_password: "",
					smtp_from: "",
					imap_host: "",
					imap_username: "",
					imap_password: "",
					enabled: false,
				},
			});
			return;
		}
	}
}

interface RawServer {
	id: string;
	name: string;
	transport: string;
	enabled: boolean;
	url: string | null;
	command: string | null;
	arguments: string[];
}

export async function listMcpServers(): Promise<McpServer[]> {
	const servers = await connector<RawServer[]>("/v1/mcp/servers");
	return Promise.all(
		servers.map(async (server) => {
			let check: { connected: boolean; detail?: string };
			try {
				check = await connector<{ connected: boolean; detail?: string }>(
					`/v1/mcp/servers/${encodeURIComponent(server.id)}/check`
				);
			} catch (error) {
				check = {
					connected: false,
					detail: error instanceof Error ? error.message : String(error),
				};
			}
			return {
				id: server.id,
				name: server.name,
				transport: server.transport,
				target: server.url ?? [server.command, ...server.arguments].filter(Boolean).join(" "),
				enabled: server.enabled,
				connected: check.connected,
				detail: check.detail ?? "",
			};
		})
	);
}

export function mcpIdFrom(value: unknown): string {
	if (typeof value !== "string" || !/^[\w-]{1,100}$/.test(value))
		throw new DeviceError("errors.connectors.invalidMcpId", 400);
	return value;
}

// Adds MCP servers from a standard { "mcpServers": { … } } config; they run on the device.
export async function importMcpServers(config: unknown): Promise<void> {
	const servers = (config as { mcpServers?: unknown })?.mcpServers;
	if (!servers || typeof servers !== "object" || Array.isArray(servers) || Object.keys(servers).length === 0) {
		throw new DeviceError("errors.connectors.mcpConfig", 400, { example: '{ "mcpServers": { "name": { … } } }' });
	}
	await connector("/v1/mcp/servers/import-json", {
		method: "POST",
		body: { config: { mcpServers: servers }, runEnvironment: "tiiny" },
	});
}

export async function mcpTools(id: string): Promise<McpTool[]> {
	const tools = await connector<{ name: string; description?: string }[]>(
		`/v1/mcp/servers/${encodeURIComponent(id)}/tools`
	);
	return tools.map((tool) => ({ name: tool.name, description: tool.description ?? "" }));
}

export async function deleteMcpServer(id: string): Promise<void> {
	await connector(`/v1/mcp/servers/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export interface McpToolSpec {
	serverId: string;
	serverName: string;
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

// Tools of every enabled MCP server the device can reach, for Task mode.
export async function connectedMcpTools(): Promise<McpToolSpec[]> {
	let servers: McpServer[] = [];
	try {
		servers = await listMcpServers();
	} catch {
		// The connector is unreachable: no MCP tools.
	}
	const lists = await Promise.all(
		servers
			.filter((server) => server.enabled && server.connected)
			.map(async (server) => {
				let tools: { name: string; description?: string; input_schema?: Record<string, unknown> }[] = [];
				try {
					tools = await connector<typeof tools>(`/v1/mcp/servers/${encodeURIComponent(server.id)}/tools`);
				} catch {
					// The server's tools cannot be listed: it contributes none.
				}
				return tools.map((tool) => ({
					serverId: server.id,
					serverName: server.name,
					name: tool.name,
					description: tool.description ?? "",
					inputSchema: tool.input_schema ?? { type: "object", properties: {} },
				}));
			})
	);
	return lists.flat();
}

interface ToolCallReply {
	ok?: boolean;
	content?: { type: string; text?: string }[];
	error?: string;
}

export async function callMcpTool(serverId: string, tool: string, arguments_: unknown): Promise<string> {
	const reply = await deviceJson<ToolCallReply>(
		`/v1/mcp/servers/${encodeURIComponent(serverId)}/tools/${encodeURIComponent(tool)}/call`,
		{
			method: "POST",
			service: "connector",
			headers: { "x-user-id": await deviceId() },
			body: { arguments: arguments_ },
			slow: true,
		}
	);
	const text = (reply.content ?? []).map((part) => part.text ?? `[${part.type}]`).join("\n");
	if (reply.ok === false) throw new Error(reply.error || text || "The tool failed");
	return text;
}
