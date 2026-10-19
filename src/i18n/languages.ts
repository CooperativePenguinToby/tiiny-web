// The languages the UI is translated into. Each has a src/locales/<code>.json file; English is the
// source the others are translated from and the fallback for anything missing.

export const LANGUAGES = [
	{ code: "en", name: "English", dayjs: "en" },
	{ code: "zh-CN", name: "简体中文", dayjs: "zh-cn" },
	{ code: "es", name: "Español", dayjs: "es" },
	{ code: "hi", name: "हिन्दी", dayjs: "hi" },
	{ code: "pt-BR", name: "Português", dayjs: "pt-br" },
	{ code: "bn", name: "বাংলা", dayjs: "bn" },
	{ code: "ru", name: "Русский", dayjs: "ru" },
	{ code: "ja", name: "日本語", dayjs: "ja" },
	{ code: "fr", name: "Français", dayjs: "fr" },
	{ code: "de", name: "Deutsch", dayjs: "de" },
	{ code: "ko", name: "한국어", dayjs: "ko" },
	{ code: "tr", name: "Türkçe", dayjs: "tr" },
	{ code: "it", name: "Italiano", dayjs: "it" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: Language = "en";

// Holds the language picked in the top bar; without it the browser's Accept-Language decides.
export const LANGUAGE_COOKIE = "lang";

const byLowercase = new Map<string, Language>(LANGUAGES.map(({ code }) => [code.toLowerCase(), code]));

// "pt-PT" → "pt-BR", "zh" → "zh-CN": an exact match first, then the first language with the same base.
function match(tag: string): Language | undefined {
	const lower = tag.trim().toLowerCase();
	if (!lower) return undefined;
	const exact = byLowercase.get(lower);
	if (exact) return exact;
	const [base] = lower.split("-", 1);
	return LANGUAGES.find(({ code }) => code.toLowerCase().split("-", 1)[0] === base)?.code;
}

export const isLanguage = (value: unknown): value is Language =>
	typeof value === "string" && LANGUAGES.some(({ code }) => code === value);

// The cookie wins; otherwise the highest-weighted Accept-Language entry we have; otherwise English.
export function resolveLanguage(cookie: string | undefined, acceptLanguage: string | null = ""): Language {
	if (isLanguage(cookie)) return cookie;
	const ranked = (acceptLanguage ?? "")
		.split(",")
		.map((entry) => {
			const [tag = "", ...parameters] = entry.split(";");
			const q = parameters.map((p) => p.trim()).find((p) => p.startsWith("q="));
			return { tag, weight: q ? Number(q.slice(2)) || 0 : 1 };
		})
		.filter(({ weight }) => weight > 0)
		.toSorted((a, b) => b.weight - a.weight);
	for (const { tag } of ranked) {
		const language = match(tag);
		if (language) return language;
	}
	return DEFAULT_LANGUAGE;
}

export const dayjsLocale = (language: Language): string =>
	LANGUAGES.find(({ code }) => code === language)?.dayjs ?? "en";
