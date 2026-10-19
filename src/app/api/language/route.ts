import { NextResponse } from "next/server";

import { isLanguage } from "@/i18n/languages";
import { getT, setLanguage } from "@/i18n/server";

// Saves the language picked in the top bar. Open without a session: it only sets a preference.
export async function POST(request: Request): Promise<Response> {
	let input: { language?: unknown } = {};
	try {
		input = (await request.json()) as { language?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	if (!isLanguage(input.language)) {
		const t = await getT();
		return NextResponse.json({ error: t("errors.unknownLanguage") }, { status: 400 });
	}
	await setLanguage(input.language);
	return NextResponse.json({ language: input.language });
}
