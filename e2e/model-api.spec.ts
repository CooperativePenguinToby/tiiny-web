import { expect, test } from "@playwright/test";

import { CHAT_MODEL, deviceApiKey, holdChatModel } from "./helpers";

// The HTTPS proxy for the device's model APIs, used as other apps use it: no web UI session (the `request`
// fixture has none), the client's own credentials passed through to the device.
const app = new URL(process.env.BASE_URL ?? "https://localhost:8443");
const API_ORIGIN = `https://${app.hostname}:${process.env.E2E_API_PORT ?? "11443"}`;
const AGENT_DOMAIN = process.env.E2E_AGENT_DOMAIN;
// The ways in that lay the APIs out as the device does.
const ROOTS = [API_ORIGIN, ...(AGENT_DOMAIN ? [`https://api.${AGENT_DOMAIN}:${app.port}`] : [])];

const bearer = (): Record<string, string> => ({ Authorization: `Bearer ${deviceApiKey()}` });

test("the client's Bearer token or x-api-key reaches the device, and the device decides", async ({ request: api }) => {
	for (const root of [...ROOTS, `${app.origin}/proxy/openai`]) {
		const withBearer = await api.get(`${root}/v1/models`, { headers: bearer() });
		expect(withBearer.status(), root).toBe(200);
		const withApiKey = await api.get(`${root}/v1/models`, { headers: { "x-api-key": deviceApiKey() } });
		expect(withApiKey.status(), root).toBe(200);
		const anonymous = await api.get(`${root}/v1/models`);
		expect(anonymous.status(), root).toBe(401);
		expect(await anonymous.text(), root).toContain("Missing token");
		const wrong = await api.get(`${root}/v1/models`, { headers: { Authorization: "Bearer not-the-key" } });
		expect(wrong.status(), root).toBe(401);
	}
	for (const root of [...ROOTS, `${app.origin}/proxy/ollama`]) {
		const tags = await api.get(`${root}/api/tags`, { headers: bearer() });
		expect(tags.status(), root).toBe(200);
		const { models } = (await tags.json()) as { models: unknown[] };
		expect(models.length, root).toBeGreaterThan(0);
	}
});

test("only model API paths are forwarded", async ({ request: api }) => {
	const refused = [
		...ROOTS.flatMap((root) => [
			`${root}/api/v1/sys/status`,
			`${root}/v1/backup`,
			`${root}/auth/sign-in`,
			`${root}/v1/models/../../api/v1/sys/status`,
			`${root}/v1/models/%2e%2e/%2e%2e/api/v1/sys/status`,
			`${root}/v1/models/..%2F..%2Fapi%2Fv1%2Fsys%2Fstatus`,
		]),
		// Each path prefix serves its own format only.
		`${app.origin}/proxy/ollama/v1/models`,
		`${app.origin}/proxy/openai/api/tags`,
		`${app.origin}/proxy/anthropic/v1/chat/completions`,
		`${app.origin}/proxy/openai/api/v1/sys/status`,
	];
	for (const url of refused) {
		const response = await api.get(url, { headers: bearer() });
		expect(response.status(), url).toBe(404);
		expect(await response.text(), url).toContain("is not a model API path this proxy forwards");
	}
	// The web UI on the app's port is unaffected.
	const signIn = await api.get(`${app.origin}/auth/sign-in`);
	expect(signIn.status()).toBe(200);
});

test("chat streams through the proxy in all three formats", async ({ request: api }) => {
	const model = await holdChatModel();
	try {
		const openai = await api.post(`${API_ORIGIN}/v1/chat/completions`, {
			headers: bearer(),
			data: { model: CHAT_MODEL, stream: true, max_tokens: 30, messages: [{ role: "user", content: "Say hi." }] },
			timeout: 5 * 60_000,
		});
		expect(openai.status()).toBe(200);
		expect(openai.headers()["content-type"]).toContain("text/event-stream");
		const openaiText = await openai.text();
		const events = openaiText.split("\n").filter((line) => line.startsWith("data: "));
		expect(events.length).toBeGreaterThan(2);
		expect(events.at(-1)).toBe("data: [DONE]");

		const anthropic = await api.post(`${app.origin}/proxy/anthropic/v1/messages`, {
			headers: { "x-api-key": deviceApiKey(), "anthropic-version": "2023-06-01" },
			data: { model: CHAT_MODEL, max_tokens: 30, stream: true, messages: [{ role: "user", content: "Say hi." }] },
			timeout: 5 * 60_000,
		});
		expect(anthropic.status()).toBe(200);
		const anthropicText = await anthropic.text();
		expect(anthropicText).toContain("event: message_start");
		expect(anthropicText).toContain("event: message_stop");

		const ollama = await api.post(`${ROOTS.at(-1)}/api/chat`, {
			headers: bearer(),
			data: {
				model: CHAT_MODEL,
				stream: true,
				messages: [{ role: "user", content: "Say hi." }],
				options: { num_predict: 30 },
			},
			timeout: 5 * 60_000,
		});
		expect(ollama.status()).toBe(200);
		const ollamaText = await ollama.text();
		const lines = ollamaText
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { done: boolean });
		expect(lines.length).toBeGreaterThan(2);
		expect(lines.at(-1)?.done).toBe(true);
	} finally {
		await model.release();
	}
});
