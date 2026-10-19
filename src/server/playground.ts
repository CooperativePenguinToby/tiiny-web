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
		throw new DeviceError("errors.request.modelIdFormat", 400, { field: "model" });
	return value;
}

// The messages for each playground input; numbered inputs are one of a list.
const TEXT_ERRORS = {
	text: { required: "errors.playground.textRequired", tooLong: "errors.playground.textTooLong" },
	query: { required: "errors.playground.queryRequired", tooLong: "errors.playground.queryTooLong" },
	numberedText: {
		required: "errors.playground.numberedTextRequired",
		tooLong: "errors.playground.numberedTextTooLong",
	},
	document: { required: "errors.playground.documentRequired", tooLong: "errors.playground.documentTooLong" },
} as const;

export function textOf(
	value: unknown,
	input: { kind: "text" | "query" } | { kind: "numberedText" | "document"; number: number },
	max = 20_000
): string {
	const messages = TEXT_ERRORS[input.kind];
	const number = "number" in input ? input.number : undefined;
	if (typeof value !== "string" || !value.trim()) throw new DeviceError(messages.required, 400, { number });
	if (value.length > max) throw new DeviceError(messages.tooLong, 400, { number, count: max });
	return value;
}
