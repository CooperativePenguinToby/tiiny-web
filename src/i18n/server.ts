import { cookies, headers } from "next/headers";
import type { TFunction } from "i18next";

import { LANGUAGE_COOKIE, resolveLanguage, type Language } from "./languages";
import { fixedT } from "./translate";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

// The request's language: the top-bar choice (cookie), else the browser's Accept-Language, else English.
export async function getLanguage(): Promise<Language> {
	const [jar, headerList] = await Promise.all([cookies(), headers()]);
	return resolveLanguage(jar.get(LANGUAGE_COOKIE)?.value, headerList.get("accept-language"));
}

export async function setLanguage(language: Language): Promise<void> {
	const jar = await cookies();
	jar.set(LANGUAGE_COOKIE, language, { secure: true, sameSite: "lax", path: "/", maxAge: ONE_YEAR_SECONDS });
}

export async function getT(): Promise<TFunction> {
	return fixedT(await getLanguage());
}
