import { DeviceError } from "./device";

const REPO_ID = /^[\w.-]+\/[\w.-]+$/;

// Accepts `org/name` or a huggingface.co URL and returns the canonical repo URL the device expects.
export async function hfUrlFrom(request: Request): Promise<string> {
	let body: { repo?: unknown };
	try {
		body = (await request.json()) as { repo?: unknown };
	} catch {
		body = {};
	}
	const { repo } = body;
	const text = typeof repo === "string" ? repo.trim() : "";
	const repositoryId = text
		.replace(/^https?:\/\/(www\.)?huggingface\.co\//, "")
		.replace(/\/(tree|blob)\/.*$/, "")
		.replace(/\/$/, "");
	if (!REPO_ID.test(repositoryId))
		throw new DeviceError("Enter a Hugging Face repo as org/name or its huggingface.co URL", 400);
	return `https://huggingface.co/${repositoryId}`;
}

// Inspection verdicts for the compatibility list, kept for HF_CHECK_CACHE_MS (default 1 hour) so repeat
// searches don't re-ask the device. Process memory is enough: this server is a single instance, and a
// miss just asks the device again.
const CACHE_TTL_MS = Number(process.env.HF_CHECK_CACHE_MS ?? 60 * 60_000);
const CACHE_MAX_ENTRIES = 2000;
const verdictCache = new Map<string, { expires: number; value: unknown }>();

export function cachedVerdict<T>(key: string): T | undefined {
	const entry = verdictCache.get(key.toLowerCase());
	if (!entry) return undefined;
	if (entry.expires < Date.now()) {
		verdictCache.delete(key.toLowerCase());
		return undefined;
	}
	return entry.value as T;
}

export function rememberVerdict(key: string, value: unknown): void {
	if (CACHE_TTL_MS <= 0) return;
	if (verdictCache.size >= CACHE_MAX_ENTRIES) verdictCache.delete(verdictCache.keys().next().value!);
	verdictCache.set(key.toLowerCase(), { expires: Date.now() + CACHE_TTL_MS, value });
}
