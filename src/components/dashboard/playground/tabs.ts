import type { PlaygroundKind } from "@/types/device";
import { paths } from "@/paths";

// One tab per kind of model; each is its own route under the Playground (the first at the Playground itself).
export const playgroundTabs: { kind: PlaygroundKind; slug: string; label: string; intro: string }[] = [
	{
		kind: "asr",
		slug: "",
		label: "Speech to text",
		intro: "Transcribe a WAV recording with a speech recognition model.",
	},
	{ kind: "tts", slug: "text-to-speech", label: "Text to speech", intro: "Turn text into speech with a voice model." },
	{ kind: "ocr", slug: "ocr", label: "OCR", intro: "Read the text in an image." },
	{
		kind: "embed",
		slug: "embeddings",
		label: "Embeddings",
		intro: "Turn texts into vectors and compare how similar they are.",
	},
	{ kind: "rerank", slug: "rerank", label: "Rerank", intro: "Order documents by how well they answer a query." },
	{
		kind: "text",
		slug: "benchmark",
		label: "Benchmark",
		intro: "Measure how fast a text model generates, like tiiny bench.",
	},
];

export function playgroundHref(slug: string): string {
	return slug ? `${paths.dashboard.playground}/${slug}` : paths.dashboard.playground;
}
