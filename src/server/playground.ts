import type { PlaygroundKind } from "@/types/device";

import { DeviceError } from "./device";

// Store model types for each playground kind (`tiiny run asr|tts|ocr|embed|rerank`, `tiiny bench`).
export const KIND_OF_TYPE: Record<string, PlaygroundKind> = {
	ASR: "asr",
	"Text-to-Speech": "tts",
	"Image-to-Text": "ocr",
	"Text Embedding": "embed",
	"Text Reranking": "rerank",
	"Text Generation": "text",
	"Image-Text-to-Text": "text",
};

export function modelIdOf(value: unknown): string {
	if (typeof value !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(value))
		throw new DeviceError("model must look like Org/Name", 400);
	return value;
}

export function textOf(value: unknown, name: string, max = 20_000): string {
	if (typeof value !== "string" || !value.trim()) throw new DeviceError(`${name} is required`, 400);
	if (value.length > max) throw new DeviceError(`${name} is longer than ${max} characters`, 400);
	return value;
}
