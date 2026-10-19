// Takes the README screenshots (docs/screenshots/<view>-<name>.png) of the real app against the real device,
// in a desktop and a phone view. Personal values (device name and serial, Wi-Fi networks, addresses,
// personalization, conversation titles, Vault files and summaries, MCP servers) are replaced in the page's
// HTML just before each shot; nothing is changed on the device. The chat shot sends one message to the chat
// model (loaded for it if needed, then unloaded) and the conversation is deleted afterwards.
//
//   BASE_URL=https://localhost:8443 ADMIN_PASSWORD=... npm run screenshots
import { expect, test, type Browser, type Page } from "@playwright/test";

import { conversationIds, historyCall, holdChatModel, selectOption, sendChat, signIn } from "../e2e/helpers";

const OUT = "docs/screenshots";
const VIEWS = {
	desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
	phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
} as const;
type View = keyof typeof VIEWS;

const PLAYGROUND = [
	["", "playground-speech"],
	["text-to-speech", "playground-tts"],
	["ocr", "playground-ocr"],
	["embeddings", "playground-embeddings"],
	["rerank", "playground-rerank"],
	["benchmark", "playground-benchmark"],
] as const;

const SAMPLE = {
	deviceName: "My Tiiny",
	serial: "TNYM000000000000000",
	networks: ["HomeWiFi", "HomeWiFi-5G", "Workshop", "Guest", "CoffeeShop", "Library"],
	addresses: "192.168.1.40, fe80::1c2b:3d4e:5f60:7182",
	host: "192.168.1.40",
	conversations: [
		"Sourdough starter tips",
		"Summarise the Q3 planning notes",
		"Translate the welcome email to German",
		"A cat playing the piano, watercolour",
		"Compare two laptops for photo editing",
		"Weekly meal plan with a shopping list",
	],
	files: [
		{ name: "Product roadmap 2027.pdf", size: "2.4 MB", added: "12 Oct 2026 09:15" },
		{ name: "Team handbook.docx", size: "860.3 KB", added: "14 Oct 2026 16:40" },
		{ name: "Q3 sales.xlsx", size: "148.9 KB", added: "18 Oct 2026 11:02" },
	],
	summaries: [
		"Planned the garden layout for spring and compared three raised-bed designs. Drafted a shopping list for soil and seeds.",
		"Reviewed the Q3 planning notes, summarised the open decisions, and translated the welcome email for the new team in Berlin.",
		"Asked for sourdough tips and a weekly feeding schedule; generated a watercolour picture of a cat playing the piano.",
		"Compared two laptops for photo editing and summarised the differences in a table.",
	],
	mcp: { name: "home-assistant", target: "http · http://192.168.1.20:8123/mcp" },
	personalization: {
		Name: "Alex",
		Occupation: "Product designer",
		Preferences: "Short answers with a clear recommendation first. Use metric units.",
		"Recent focus": "Planning a kitchen renovation and learning to bake sourdough bread.",
	},
};

// Replaces personal values in the rendered page (runs in the browser).
async function sanitize(page: Page): Promise<void> {
	await page.evaluate((sample) => {
		// API base URLs name this machine; a sample LAN address stands in.
		for (const code of document.querySelectorAll('[data-testid^="api-base-"]')) {
			const text = code.textContent!;
			const url = new URL(text);
			url.hostname = sample.host;
			// The app's own port is the default one in the shots, whatever port this run uses.
			if (url.port === location.port) url.port = "8443";
			// URL adds a "/" to a bare origin; keep the original form.
			code.textContent = text.endsWith("/") ? url.href : url.href.replace(/\/$/, "");
		}

		const deviceName = document.querySelector('[data-testid="device-name"]');
		if (deviceName) deviceName.textContent = sample.deviceName;
		const serial = document.querySelector('[data-testid="device-serial"]');
		if (serial) serial.textContent = sample.serial;

		// Wi-Fi: a few sample networks, named consistently wherever the card mentions them.
		const network = document.querySelector('[data-testid="settings-network"]');
		if (network) {
			const rows = [...network.querySelectorAll('[data-testid^="wifi-"]')].filter(
				(row) => (row as HTMLElement).dataset.testid !== "wifi-status"
			);
			const names = new Map<string, string>();
			for (const [index, row] of rows.entries()) {
				if (index >= sample.networks.length) {
					row.remove();
					continue;
				}
				// The real name is kept on the element, so later calls (e.g. with a dialog open) can map it again.
				const span = row.querySelector("span");
				if (!span) continue;
				span.dataset.realName ??= span.textContent ?? "";
				names.set(span.dataset.realName, sample.networks[index]!);
				span.textContent = sample.networks[index]!;
			}
			// The connected network is also named in the status line and the notes. Single-word names are
			// matched as whole words, so a network called "tiiny" does not touch other text.
			const scopes = [network, ...document.querySelectorAll('[role="dialog"]')];
			const textNodes = scopes.flatMap((scope) => {
				const nodes: Node[] = [];
				const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
				for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
				return nodes;
			});
			for (const node of textNodes) {
				let text = node.textContent!;
				for (const [real, fake] of names) if (/\W/.test(real)) text = text.split(real).join(fake);
				node.textContent = text
					.split(/([\w-]+)/)
					.map((part) => names.get(part) ?? part)
					.join("");
			}
			for (const row of network.querySelectorAll('[data-testid^="interface-"]')) {
				const cell = row.querySelectorAll("td")[2];
				if (cell) cell.textContent = sample.addresses;
			}
		}

		for (const [index, row] of document.querySelectorAll('[data-testid^="conversation-"]').entries()) {
			const title = row.querySelector("a");
			if (title) title.textContent = sample.conversations[index % sample.conversations.length]!;
		}

		const files = [...document.querySelectorAll('[data-testid^="vault-file-"]')];
		const firstFile = files[0];
		if (firstFile) {
			for (const extra of files.slice(1)) extra.remove();
			for (const [index, file] of sample.files.entries()) {
				const row = index === 0 ? firstFile : (firstFile.cloneNode(true) as Element);
				const cells = row.querySelectorAll("td");
				cells[0]!.textContent = file.name;
				cells[1]!.textContent = file.size;
				cells[2]!.textContent = file.added;
				if (index > 0) firstFile.parentElement!.append(row);
			}
		}

		for (const [index, summary] of document.querySelectorAll('[data-testid^="summary-"]').entries()) {
			for (const text of summary.querySelectorAll(".MuiTypography-body2")) {
				text.textContent = sample.summaries[index % sample.summaries.length]!;
			}
		}

		// When another server on this machine already holds the agent ports, the agents report it; that is
		// about the screenshot setup, not the app.
		for (const note of document.querySelectorAll(".MuiTypography-root")) {
			if (note.textContent?.includes("EADDRINUSE")) note.remove();
		}

		// Hugging Face results are other people's repo names; keep the shot work-safe.
		for (const row of document.querySelectorAll("tr")) {
			if (/nsfw/i.test(row.textContent ?? "")) row.remove();
		}

		for (const server of document.querySelectorAll('[data-testid^="mcp-"]:not([data-testid="mcp-tools"])')) {
			const name = server.querySelector(".MuiTypography-subtitle2");
			if (name) name.textContent = sample.mcp.name;
			const target = server.querySelector(".MuiTypography-caption");
			if (target) target.textContent = sample.mcp.target;
		}
	}, SAMPLE);
}

async function shoot(page: Page, view: View, name: string): Promise<void> {
	await sanitize(page);
	await page.screenshot({ path: `${OUT}/${view}-${name}.png`, animations: "disabled" });
}

// Opens a page and waits for its data (the pages poll the device).
async function open(page: Page, path: string, ready?: string): Promise<void> {
	await page.goto(path);
	if (ready) await expect(page.getByText(ready, { exact: true }).first()).toBeVisible({ timeout: 60_000 });
	await page.waitForTimeout(4000);
}

// Scrolls an element to just below the top bar.
async function scrollTo(page: Page, testId: string): Promise<void> {
	await page.getByTestId(testId).evaluate((element) => {
		window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 80);
	});
	await page.waitForTimeout(500);
}

async function signedIn(browser: Browser, view: View): Promise<Page> {
	const context = await browser.newContext({ ...VIEWS[view], locale: "en-US", ignoreHTTPSErrors: true });
	const page = await context.newPage();
	await page.goto("/auth/sign-in");
	await shoot(page, view, "sign-in");
	await signIn(page);
	return page;
}

async function pages(page: Page, view: View, conversationId: string): Promise<void> {
	await open(page, "/dashboard", "Loaded models");
	await shoot(page, view, "overview");
	await open(page, "/models");
	await shoot(page, view, "models");
	await open(page, "/models/store");
	await shoot(page, view, "store");
	await open(page, "/agents");
	await expect(page.locator('[data-testid^="agent-"]').first()).toBeVisible({ timeout: 60_000 });
	await shoot(page, view, "agents");
	await open(page, `/chat?c=${encodeURIComponent(conversationId)}`);
	await expect(page.getByTestId("message-assistant").first()).toBeVisible({ timeout: 60_000 });
	await page.waitForTimeout(1000);
	await shoot(page, view, "chat");
	await open(page, "/chat/history");
	await shoot(page, view, "history");
	await open(page, "/vault");
	await shoot(page, view, "vault");
	await open(page, "/vault/chat-history");
	await shoot(page, view, "vault-summaries");
	for (const [slug, name] of PLAYGROUND) {
		await open(page, slug ? `/playground/${slug}` : "/playground");
		await shoot(page, view, name);
	}
	await open(page, "/connectors");
	await shoot(page, view, "connectors");
	await open(page, "/connectors/add-mcp");
	await shoot(page, view, "connectors-add-mcp");
	await open(page, "/settings", "My device");
	for (const [label, value] of Object.entries(SAMPLE.personalization)) {
		await page.getByRole("textbox", { name: label, exact: true }).fill(value);
	}
	await page.evaluate(() => window.scrollTo(0, 0));
	await shoot(page, view, "settings");
	// The network list appears once the device's Wi-Fi scan is done.
	await expect(
		page.getByTestId("settings-network").locator('[data-testid^="wifi-"]:not([data-testid="wifi-status"])').first()
	).toBeVisible({ timeout: 120_000 });
	await scrollTo(page, "settings-network");
	await shoot(page, view, "settings-network");
	// Joining another network asks first; the shot shows that warning and then cancels.
	await page.getByTestId("settings-network").getByRole("button", { name: "Join" }).first().click();
	const join = page.getByRole("dialog");
	await expect(join).toBeVisible();
	await page.waitForTimeout(500);
	await shoot(page, view, "settings-wifi-join");
	await join.getByRole("button", { name: "Cancel" }).click();
	await expect(join).toBeHidden();
	await scrollTo(page, "settings-api");
	await shoot(page, view, "settings-api");
}

test("README screenshots", async ({ browser }) => {
	test.setTimeout(30 * 60_000);

	const desktop = await signedIn(browser, "desktop");
	const phone = await signedIn(browser, "phone");

	// One real conversation for the chat shots, deleted afterwards.
	const known = new Set(await conversationIds());
	const model = await holdChatModel();
	try {
		await open(desktop, "/chat");
		await selectOption(desktop, "Model", model.name);
		await sendChat(
			desktop,
			"Give me three quick tips for keeping a sourdough starter healthy. Plain text, no markdown."
		);
		const ids = await conversationIds();
		const conversationId = ids.find((id) => !known.has(id)) ?? "";
		expect(conversationId, "the chat was saved to history").not.toBe("");

		await pages(desktop, "desktop", conversationId);
		await pages(phone, "phone", conversationId);

		// Hugging Face search, the language menu, and the UI in another language.
		await open(desktop, "/models/hugging-face");
		await selectOption(desktop, "Base model", "Qwen/Qwen3.5-9B (on device)");
		await desktop.getByRole("button", { name: "Search Hugging Face" }).click();
		await expect(desktop.getByRole("table", { name: "Hugging Face repos" })).toBeVisible({ timeout: 120_000 });
		await desktop.waitForTimeout(8000);
		await desktop.getByRole("table", { name: "Hugging Face repos" }).evaluate((table) => {
			window.scrollTo(0, table.getBoundingClientRect().top + window.scrollY - 360);
		});
		await desktop.waitForTimeout(500);
		await shoot(desktop, "desktop", "hugging-face");
		await open(desktop, "/dashboard", "Loaded models");
		await desktop.getByRole("button", { name: /^Language:/ }).click();
		await desktop.waitForTimeout(500);
		await shoot(desktop, "desktop", "language-menu");
		await desktop.keyboard.press("Escape");
		await desktop.context().addCookies([{ name: "lang", value: "ja", url: desktop.url() }]);
		await open(desktop, "/dashboard");
		await shoot(desktop, "desktop", "overview-ja");
		await desktop.context().clearCookies({ name: "lang" });
	} finally {
		const after = await conversationIds();
		for (const id of after) {
			if (!known.has(id)) await historyCall(`/conversations/${id}`, { method: "DELETE" });
		}
		await model.release();
	}
});
