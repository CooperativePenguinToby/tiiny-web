import { randomUUID } from "node:crypto";

import type { Conversation, ConversationSummary, StoredTurn, TurnToSave } from "@/types/device";

import { DeviceError, deviceId, deviceJson } from "./device";

// Conversations live in the device's chat-history service, the same store TiinyOS uses, so chats from
// either app show up in both. The service identifies the owner by the device serial.
const BASE = "/v1/chat";
const ASSISTANT = "default";

async function history<T>(pathname: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
	return deviceJson<T>(`${BASE}${pathname}`, {
		...init,
		service: "chatHistory",
		headers: { "X-Device-Id": await deviceId() },
	});
}

interface RawConversation {
	conversation_id: string;
	title: string;
	created_at: string;
	updated_at: string;
}
interface RawMessage {
	message_id: string;
	role: "user" | "assistant";
	status: string;
	model_id: string | null;
	seq_in_conversation: number;
}
interface RawBlock {
	block_type: string;
	position_in_message: number;
	content_text: string | null;
}

const summary = (raw: RawConversation): ConversationSummary => ({
	conversationId: raw.conversation_id,
	title: raw.title,
	createdAt: raw.created_at,
	updatedAt: raw.updated_at,
});

export async function listConversations(): Promise<ConversationSummary[]> {
	const all: ConversationSummary[] = [];
	let cursor = "";
	for (;;) {
		const page = await history<{ items: RawConversation[]; next_cursor: string | null }>(
			`/conversations?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
		);
		all.push(...page.items.map((item) => summary(item)));
		if (!page.next_cursor || page.items.length === 0) return all;
		cursor = page.next_cursor;
	}
}

export function conversationIdFrom(value: unknown): string {
	if (typeof value !== "string" || !/^[\w-]{1,100}$/.test(value)) throw new DeviceError("Invalid conversation id", 400);
	return value;
}

async function messagesOf(conversationId: string): Promise<RawMessage[]> {
	const messages: RawMessage[] = [];
	let cursor = 0;
	for (;;) {
		const page = await history<{ items: RawMessage[]; next_cursor: number | null }>(
			`/conversations/${encodeURIComponent(conversationId)}/messages?limit=100&include_deleted=false${cursor ? `&cursor_seq=${cursor}` : ""}`
		);
		messages.push(...page.items);
		if (!page.next_cursor || page.items.length === 0) break;
		cursor = page.next_cursor;
	}
	return messages.sort((a, b) => a.seq_in_conversation - b.seq_in_conversation);
}

// Runs `task` over `items` with at most `limit` in flight.
async function mapLimited<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = Array.from({ length: items.length });
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const index = next++;
				results[index] = await task(items[index]);
			}
		})
	);
	return results;
}

export async function readConversation(conversationId: string): Promise<Conversation> {
	const raw = await history<RawConversation>(`/conversations/${encodeURIComponent(conversationId)}`);
	const messages = await messagesOf(conversationId);
	const turns = await mapLimited(messages, 6, async (message): Promise<StoredTurn> => {
		const { items } = await history<{ items: RawBlock[] }>(
			`/messages/${encodeURIComponent(message.message_id)}/blocks`
		);
		const blocks = items.sort((a, b) => a.position_in_message - b.position_in_message);
		const text = (type: string): string =>
			blocks
				.filter((block) => block.block_type === type)
				.map((block) => block.content_text ?? "")
				.join("\n\n");
		const reasoning = text("thinking");
		return {
			role: message.role,
			content: text("main_text"),
			...(reasoning ? { reasoning } : {}),
			modelId: message.model_id,
			status: message.status,
		};
	});
	return { ...summary(raw), turns };
}

// TiinyOS titles a new conversation with the start of its first message.
const titleFor = (text: string): string => {
	const line = text.replaceAll(/\s+/g, " ").trim();
	return line.length > 50 ? `${line.slice(0, 50)}...` : line;
};

export async function saveTurn(turn: TurnToSave): Promise<string> {
	const conversationId = turn.conversationId ?? randomUUID();
	const existing = turn.conversationId ? await messagesOf(turn.conversationId) : [];
	const seq = existing.length;
	const now = new Date().toISOString();
	const userId = randomUUID();
	const replyId = randomUUID();
	const message = (id: string, role: "user" | "assistant", position: number, extra: Record<string, unknown>) => ({
		message_id: id,
		conversation_id: conversationId,
		role,
		assistant_id: ASSISTANT,
		seq_in_conversation: seq + position,
		created_at: now,
		updated_at: now,
		model_id: turn.modelId,
		metrics_json: null,
		...extra,
	});
	const block = (messageId: string, type: string, position: number, content: string, extra = {}) => ({
		block_id: randomUUID(),
		message_id: messageId,
		conversation_id: conversationId,
		block_type: type,
		block_status: "success",
		position_in_message: position,
		created_at: now,
		updated_at: now,
		content_text: content,
		...extra,
	});
	const reasoning = turn.assistant.reasoning?.trim();
	await history("/turns/insert", {
		method: "POST",
		body: {
			conversation: {
				conversation_id: conversationId,
				assistant_id: ASSISTANT,
				...(turn.conversationId
					? {}
					: { title: titleFor(turn.user), title_source: "default", is_title_manual: false, pinned: false }),
				topic_prompt: null,
			},
			messages: [
				message(userId, "user", 1, { status: "success", ask_message_id: null, usage_json: null }),
				message(replyId, "assistant", 2, {
					status: turn.assistant.stopped ? "paused" : "success",
					ask_message_id: userId,
					usage_json: turn.usage ?? null,
				}),
			],
			blocks: [
				block(userId, "main_text", 1, turn.user),
				...(reasoning
					? [block(replyId, "thinking", 1, reasoning, { thinking_millsec: turn.assistant.thinkingMs ?? null })]
					: []),
				block(replyId, "main_text", reasoning ? 2 : 1, turn.assistant.content),
			],
			files: [],
			block_file_refs: [],
		},
	});
	textCache.delete(conversationId);
	return conversationId;
}

export async function deleteConversation(conversationId: string): Promise<void> {
	await history(`/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
	textCache.delete(conversationId);
}

// The service has no search, so each conversation's text is read once and kept until it changes
// (keyed by its updated_at). Lives as long as this server process.
const textCache = new Map<string, { updatedAt: string; text: string }>();

export async function searchConversations(query: string): Promise<(ConversationSummary & { snippet: string })[]> {
	const needle = query.toLowerCase();
	const conversations = await listConversations();
	const texts = await mapLimited(conversations, 4, async (conversation) => {
		const cached = textCache.get(conversation.conversationId);
		if (cached?.updatedAt === conversation.updatedAt) return cached.text;
		const full = await readConversation(conversation.conversationId);
		const text = full.turns.map((turn) => turn.content).join("\n");
		textCache.set(conversation.conversationId, { updatedAt: conversation.updatedAt, text });
		return text;
	});
	return conversations.flatMap((conversation, index) => {
		const text = texts[index];
		const at = text.toLowerCase().indexOf(needle);
		if (at === -1 && !conversation.title.toLowerCase().includes(needle)) return [];
		const snippet = at === -1 ? "" : text.slice(Math.max(0, at - 60), at + needle.length + 60).replaceAll(/\s+/g, " ");
		return [{ ...conversation, snippet }];
	});
}
