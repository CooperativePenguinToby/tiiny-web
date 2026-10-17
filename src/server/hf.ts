import { DeviceError } from "./device";

const REPO_ID = /^[\w.-]+\/[\w.-]+$/;

// Accepts `org/name` or a huggingface.co URL and returns the canonical repo URL the device expects.
export async function hfUrlFrom(request: Request): Promise<string> {
	const { repo } = (await request.json().catch(() => ({}))) as { repo?: unknown };
	const text = typeof repo === "string" ? repo.trim() : "";
	const repoId = text
		.replace(/^https?:\/\/(www\.)?huggingface\.co\//, "")
		.replace(/\/(tree|blob)\/.*$/, "")
		.replace(/\/$/, "");
	if (!REPO_ID.test(repoId))
		throw new DeviceError("Enter a Hugging Face repo as org/name or its huggingface.co URL", 400);
	return `https://huggingface.co/${repoId}`;
}
