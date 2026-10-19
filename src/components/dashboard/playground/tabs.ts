import type { ParseKeys } from "i18next";

import type { PlaygroundKind } from "@/types/device";
import { paths } from "@/paths";

// One tab per kind of model; each is its own route under the Playground (the first at the Playground itself).
// label and intro are translation keys.
export const playgroundTabs: { kind: PlaygroundKind; slug: string; label: ParseKeys; intro: ParseKeys }[] = [
	{
		kind: "asr",
		slug: "",
		label: "playground.tabs.asr.label",
		intro: "playground.tabs.asr.intro",
	},
	{ kind: "tts", slug: "text-to-speech", label: "playground.tabs.tts.label", intro: "playground.tabs.tts.intro" },
	{ kind: "ocr", slug: "ocr", label: "playground.tabs.ocr.label", intro: "playground.tabs.ocr.intro" },
	{
		kind: "embed",
		slug: "embeddings",
		label: "playground.tabs.embed.label",
		intro: "playground.tabs.embed.intro",
	},
	{ kind: "rerank", slug: "rerank", label: "playground.tabs.rerank.label", intro: "playground.tabs.rerank.intro" },
	{
		kind: "text",
		slug: "benchmark",
		label: "playground.tabs.text.label",
		intro: "playground.tabs.text.intro",
	},
];

export function playgroundHref(slug: string): string {
	return slug ? `${paths.dashboard.playground}/${slug}` : paths.dashboard.playground;
}
