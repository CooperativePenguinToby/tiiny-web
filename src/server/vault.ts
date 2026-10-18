import type { VaultFile, VaultSearchResult } from "@/types/device";

import { DeviceError, deviceId, deviceJson } from "./device";

// Vault (the device's knowledge base) answers on its own service and wants the device serial alongside
// the key, as TiinyOS sends it.
export async function kbHeaders(): Promise<Record<string, string>> {
	return { "X-Device-Id": await deviceId() };
}

// TiinyOS accepts these, up to 200 MB each and 20 per upload.
export const VAULT_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "md", "html"];
export const VAULT_MAX_FILE_BYTES = 200 * 1024 * 1024;
export const VAULT_MAX_FILES = 20;

interface SourceList {
	total: number;
	items: {
		source_id: string;
		filename: string;
		size_bytes?: number;
		created_at: string;
		finalized: boolean;
		vectorize_status?: string | null;
		vectorize_error_message?: string | null;
		chunk_count?: number;
	}[];
}

export async function listSources(kind: "files" | "conversations"): Promise<SourceList["items"]> {
	const headers = await kbHeaders();
	const items: SourceList["items"] = [];
	for (let offset = 0; ; offset += 100) {
		const page = await deviceJson<SourceList>(`/kb/sources/${kind}?limit=100&offset=${offset}`, {
			service: "kb",
			headers,
		});
		items.push(...page.items);
		if (page.items.length === 0 || items.length >= page.total) return items;
	}
}

export async function listVaultFiles(): Promise<VaultFile[]> {
	const items = await listSources("files");
	return items
		.map((item) => ({
			sourceId: item.source_id,
			filename: item.filename,
			sizeBytes: item.size_bytes ?? 0,
			addedAt: item.created_at,
			indexed: item.finalized,
			indexStatus: item.vectorize_status ?? null,
			indexError: item.vectorize_error_message ?? null,
			chunks: item.chunk_count ?? 0,
		}))
		.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function sourceIdFrom(value: unknown): string {
	if (typeof value !== "string" || !/^[\w.:#-]{1,200}$/.test(value)) throw new DeviceError("Invalid source id", 400);
	return value;
}

interface RetrieveReply {
	results?: { entry_id: string; lossless_restatement?: string; entities?: string[]; timestamp?: string }[];
}

// Semantic search over indexed Vault files and chat-history summaries (what Task mode's Vault tool uses).
export async function searchVault(query: string): Promise<VaultSearchResult[]> {
	const reply = await deviceJson<RetrieveReply>("/kb/retrieve", {
		method: "POST",
		service: "kb",
		headers: await kbHeaders(),
		body: { question: query, fast_mode: false },
		slow: true,
	});
	return (reply.results ?? []).map((result) => ({
		entryId: result.entry_id,
		source: result.entities?.[0] ?? "unknown",
		content: result.lossless_restatement ?? "",
		timestamp: result.timestamp ?? "",
	}));
}
