import { createInstance, type TFunction } from "i18next";

import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "./languages";
import { messages } from "./resources";

// Server-side translation with every language loaded. Free of request APIs, so it also serves code
// that has no request (logs, the English text of errors).

// createInstance initializes only when given a callback; with inline resources and initAsync off, that
// happens before it returns.
const i18n = createInstance(
	{
		initAsync: false,
		lng: DEFAULT_LANGUAGE,
		fallbackLng: DEFAULT_LANGUAGE,
		supportedLngs: LANGUAGES.map(({ code }) => code),
		resources: Object.fromEntries(Object.entries(messages).map(([code, translation]) => [code, { translation }])),
		interpolation: { escapeValue: false },
	},
	() => {}
);

export const fixedT = (language: Language): TFunction => i18n.getFixedT(language);
