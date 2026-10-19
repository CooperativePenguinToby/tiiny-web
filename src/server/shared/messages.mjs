// Translations for text this custom server sends outside Next (src/i18n is TypeScript and Next-bundled).
// The language is resolved as src/i18n/languages.ts resolves it: the "lang" cookie, then the best
// Accept-Language match, then English. Interpolation is {{name}} only; no plurals.
import bn from "../../locales/bn.json" with { type: "json" };
import de from "../../locales/de.json" with { type: "json" };
import en from "../../locales/en.json" with { type: "json" };
import es from "../../locales/es.json" with { type: "json" };
import fr from "../../locales/fr.json" with { type: "json" };
import hi from "../../locales/hi.json" with { type: "json" };
import it from "../../locales/it.json" with { type: "json" };
import ja from "../../locales/ja.json" with { type: "json" };
import ko from "../../locales/ko.json" with { type: "json" };
import ptBR from "../../locales/pt-BR.json" with { type: "json" };
import ru from "../../locales/ru.json" with { type: "json" };
import tr from "../../locales/tr.json" with { type: "json" };
import zhCN from "../../locales/zh-CN.json" with { type: "json" };

/**
In the order of LANGUAGES in src/i18n/languages.ts. @type {Record<string, unknown>}
*/
const MESSAGES = { en, "zh-CN": zhCN, es, hi, "pt-BR": ptBR, bn, ru, ja, fr, de, ko, tr, it };
const CODES = Object.keys(MESSAGES);

/**
@param {string} tag
*/
function match(tag) {
	const lower = tag.trim().toLowerCase();
	if (!lower) return;
	const [base] = lower.split("-", 1);
	return (
		CODES.find((code) => code.toLowerCase() === lower) ??
		CODES.find((code) => code.toLowerCase().split("-", 1)[0] === base)
	);
}

/**
@param {import("node:http").IncomingMessage} request @param {string | undefined} cookie
*/
function languageOf(request, cookie) {
	if (cookie && CODES.includes(cookie)) return cookie;
	const ranked = (request.headers["accept-language"] ?? "")
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
	return "en";
}

/**
@param {unknown} messages @param {string} key
*/
function lookup(messages, key) {
	/**
	@type {unknown}
	*/
	let node = messages;
	for (const part of key.split(".")) node = node && typeof node === "object" ? node[part] : undefined;
	return typeof node === "string" ? node : undefined;
}

/**
The message `key` (e.g. "errors.agentProxy.signIn") in the request's language.
@param {import("node:http").IncomingMessage} request @param {string | undefined} cookie the "lang" cookie
@param {string} key @param {Record<string, string>} [values]
*/
export function translate(request, cookie, key, values = {}) {
	const text = lookup(MESSAGES[languageOf(request, cookie)], key) ?? lookup(en, key) ?? key;
	return text.replaceAll(/{{\s*(\w+)\s*}}/g, (whole, name) => values[name] ?? whole);
}
