import { expect, test, type Page } from "@playwright/test";

import {
	deviceCall,
	devicePost,
	EMBEDDING_MODEL,
	forgetNewConversations,
	historyCall,
	holdChatModel,
	isRunning,
	kbCall,
	selectOption,
	sendChat,
	signIn,
	storedMessages,
	vaultFiles,
} from "./helpers";

const REPLY = 6 * 60_000;
const MCP_URL = process.env.E2E_MCP_URL ?? "https://mcp.deepwiki.com/mcp";
const conversations = forgetNewConversations();
test.beforeEach(conversations.before);
test.afterEach(conversations.after);

interface Profile {
	user_name: string;
	occupation: string;
	preferences: string;
	more_about_you: string;
}
const profile = async (): Promise<Profile> => {
	const context = await kbCall<{ profile: Profile }>("/kb/user-context");
	return context.profile;
};

const servers = (): Promise<{ id: string; name: string }[]> => deviceCall("connector", "/v1/mcp/servers");

const answer = (page: Page) => page.getByTestId("message-assistant").last();

async function openTaskMode(page: Page, modelName: string): Promise<void> {
	await signIn(page);
	await page.getByRole("link", { name: "Chat" }).click();
	await selectOption(page, "Model", modelName);
	await page.getByRole("button", { name: "Task", exact: true }).click();
	await expect(page.getByRole("button", { name: "Task", exact: true })).toHaveAttribute("aria-pressed", "true");
}

test("#23 Task mode reads a web page with a tool and answers from it; the steps are kept", async ({ page }) => {
	test.setTimeout(15 * 60_000);
	const model = await holdChatModel();
	try {
		await openTaskMode(page, model.name);
		await sendChat(page, "Read https://example.com and tell me in one sentence what that domain is for.", REPLY);
		await expect(answer(page).getByTestId("task-step").first()).toContainText("Read example.com");
		await expect(answer(page).getByTestId("message-content")).toContainText(/documentation|example/i);
		await answer(page).getByRole("button", { name: "Show result" }).first().click();
		await expect(answer(page).getByTestId("task-step-result")).toContainText("Example Domain");
		await page.screenshot({ path: "test-results/task-web.png", fullPage: true });

		await expect(page).toHaveURL(/[?&]c=[\w-]+/);
		const conversationId = new URL(page.url()).searchParams.get("c")!;
		const stored = await storedMessages(conversationId);
		const blocks = await historyCall<{ items: { block_type: string; tool_name: string }[] }>(
			`/messages/${stored[1].message_id}/blocks`
		);
		expect(blocks.items.filter((block) => block.block_type === "tool").map((block) => block.tool_name)).toContain(
			"read_web_page"
		);
		await page.reload();
		await expect(answer(page).getByTestId("task-step").first()).toContainText("Read example.com");
	} finally {
		await model.release();
	}
});

test("xflow F: a fact uploaded to Vault is found by Task mode", async ({ page }) => {
	test.setTimeout(15 * 60_000);
	const embeddingWasLoaded = await isRunning(EMBEDDING_MODEL);
	const stamp = Date.now().toString(36);
	const place = `Quarry Point ${stamp}`;
	const name = `task-e2e-${stamp}.txt`;
	const model = await holdChatModel();
	try {
		await signIn(page);
		await page.getByRole("link", { name: "Vault" }).click();
		await page.getByLabel("Files to upload").setInputFiles({
			name,
			mimeType: "text/plain",
			buffer: Buffer.from(
				`Survey notes. The lighthouse on ${place} is painted ultramarine. Its keeper is Odalys Brenner.`
			),
		});
		await expect(page.getByRole("alert").filter({ hasText: `${name} added to Vault.` })).toBeVisible({
			timeout: 3 * 60_000,
		});

		await page.getByRole("link", { name: "Chat" }).click();
		await selectOption(page, "Model", model.name);
		await page.getByRole("button", { name: "Task", exact: true }).click();
		await sendChat(
			page,
			`Search my Vault: what colour is the lighthouse on ${place} painted? Answer with the colour.`,
			REPLY
		);
		await expect(answer(page).getByTestId("task-step").first()).toContainText("Searched Vault");
		await expect(answer(page).getByTestId("message-content")).toContainText(/ultramarine/i);
		await page.screenshot({ path: "test-results/task-vault.png", fullPage: true });
	} finally {
		for (const file of await vaultFiles()) {
			if (file.filename === name)
				await kbCall("/kb/delete-memory", { method: "POST", body: { source_id: file.source_id } });
		}
		await model.release();
		if (!embeddingWasLoaded && (await isRunning(EMBEDDING_MODEL)))
			await devicePost(`/api/v1/models/${EMBEDDING_MODEL}/stop`);
	}
});

test("xflow G + #23: Task mode knows the profile and updates it when asked", async ({ page }) => {
	test.setTimeout(15 * 60_000);
	const original = await profile();
	// A randomly chosen unusual occupation: the model can only name it if it read the profile.
	const OCCUPATIONS = [
		"glassblower",
		"beekeeper",
		"taxidermist",
		"falconer",
		"luthier",
		"cooper",
		"farrier",
		"chandler",
	];
	const occupation = OCCUPATIONS[Math.floor(Math.random() * OCCUPATIONS.length)];
	const model = await holdChatModel();
	try {
		await signIn(page);
		await page.goto("/dashboard/settings");
		const card = page.getByTestId("settings-personalization");
		await card.getByLabel("Occupation").fill(occupation);
		await card.getByRole("button", { name: "Save" }).click();
		await expect(card.getByRole("alert")).toContainText("Saved.");

		await page.getByRole("link", { name: "Chat" }).click();
		await selectOption(page, "Model", model.name);
		await page.getByRole("button", { name: "Task", exact: true }).click();
		await sendChat(page, "What is my occupation, according to what you know about me? Answer with it exactly.", REPLY);
		await expect(answer(page).getByTestId("message-content")).toContainText(new RegExp(occupation, "i"));

		const renamed = `cartographer ${Date.now().toString(36)}`;
		await page.getByRole("button", { name: "New chat" }).click();
		await sendChat(page, `Please update my profile: my occupation is now "${renamed}".`, REPLY);
		await expect(answer(page).getByTestId("task-step").first()).toContainText("Updated your occupation");
		const updated = await profile();
		expect(updated.occupation).toBe(renamed);
	} finally {
		await kbCall("/kb/user-context/profile", { method: "PUT", body: original });
		await model.release();
	}
	expect(await profile()).toEqual(original);
});

test("xflow H: Task mode uses a tool of an MCP server running on the device", async ({ page }) => {
	test.setTimeout(15 * 60_000);
	const serverName = `wiki${Date.now().toString(36)}`;
	const model = await holdChatModel();
	try {
		await signIn(page);
		await page.getByRole("link", { name: "Connectors" }).click();
		await page.getByRole("button", { name: "Add MCP server" }).click();
		const dialog = page.getByRole("dialog", { name: "Add an MCP server" });
		await dialog.getByLabel("Name").fill(serverName);
		await dialog.getByLabel("URL").fill(MCP_URL);
		await dialog.getByRole("button", { name: "Add" }).click();
		await expect(page.getByTestId(`mcp-${serverName}`)).toContainText("Connected", { timeout: 60_000 });

		await page.getByRole("link", { name: "Chat" }).click();
		await selectOption(page, "Model", model.name);
		await page.getByRole("button", { name: "Task", exact: true }).click();
		await sendChat(
			page,
			"Use the read_wiki_structure MCP tool for the GitHub repository facebook/react, then list the first two top-level topics it returns.",
			REPLY
		);
		await expect(answer(page).getByTestId("task-step").first()).toContainText(`${serverName} · read_wiki_structure`);
		await answer(page).getByRole("button", { name: "Show result" }).first().click();
		await expect(answer(page).getByTestId("task-step-result").first()).toContainText("React");
		await expect(answer(page).getByTestId("message-content")).toContainText(/React/i);
		await page.screenshot({ path: "test-results/task-mcp.png", fullPage: true });
	} finally {
		for (const server of await servers()) {
			if (server.name === serverName) {
				await deviceCall("connector", `/v1/mcp/servers/${server.id}`, { method: "DELETE", text: true });
			}
		}
		await model.release();
	}
});

test("#23 Vault and Web can each be switched off for Task mode", async ({ page }) => {
	test.setTimeout(15 * 60_000);
	const original = await profile();
	const model = await holdChatModel();
	try {
		await openTaskMode(page, model.name);
		const web = page.getByRole("checkbox", { name: "Web" });
		const vault = page.getByRole("checkbox", { name: "Vault" });
		await expect(web).toBeChecked();
		await expect(vault).toBeChecked();

		await web.click();
		await expect(web).not.toBeChecked();
		await expect(vault).toBeChecked();
		await sendChat(page, "Read https://example.com and tell me what that domain is for.", REPLY);
		await expect(answer(page).getByTestId("message-content")).not.toBeEmpty();
		await expect(answer(page).getByTestId("task-step").filter({ hasText: "Read example.com" })).toHaveCount(0);

		await page.reload();
		await expect(page.getByRole("checkbox", { name: "Web" })).not.toBeChecked();
		await page.getByRole("checkbox", { name: "Web" }).click();
		await page.getByRole("checkbox", { name: "Vault" }).click();
		await expect(page.getByRole("checkbox", { name: "Vault" })).not.toBeChecked();
		await page.getByRole("button", { name: "New chat" }).click();
		await sendChat(page, "Search my Vault for any invoices and tell me what you find.", REPLY);
		await expect(answer(page).getByTestId("message-content")).not.toBeEmpty();
		await expect(answer(page).getByTestId("task-step").filter({ hasText: "Searched Vault" })).toHaveCount(0);
		// Nothing in these requests asks to change the profile.
		await expect(page.getByTestId("task-step").filter({ hasText: "Updated your" })).toHaveCount(0);
		await page.screenshot({ path: "test-results/task-switches.png", fullPage: true });
	} finally {
		await model.release();
	}
	expect(await profile()).toEqual(original);
});
