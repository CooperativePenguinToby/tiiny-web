"use client";

import * as React from "react";
import dayjs, { type ConfigType, type Dayjs } from "dayjs";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";

import "dayjs/locale/bn";
import "dayjs/locale/de";
import "dayjs/locale/es";
import "dayjs/locale/fr";
import "dayjs/locale/hi";
import "dayjs/locale/it";
import "dayjs/locale/ja";
import "dayjs/locale/ko";
import "dayjs/locale/pt-br";
import "dayjs/locale/ru";
import "dayjs/locale/tr";
import "dayjs/locale/zh-cn";

import { formatBytes, formatCount } from "@/lib/format";

import { dayjsLocale, DEFAULT_LANGUAGE, type Language } from "./languages";
import type { Messages } from "./resources";

const LanguageContext = React.createContext<Language>(DEFAULT_LANGUAGE);

export interface I18nProviderProperties {
	language: Language;
	messages: Messages;
	// English, for any key the language's file lacks; omitted when the language is English.
	fallback?: Messages;
	children: React.ReactNode;
}

export function I18nProvider({ language, messages, fallback, children }: I18nProviderProperties): React.JSX.Element {
	const i18n = React.useMemo(() => {
		const instance = createInstance();
		void instance.use(initReactI18next).init({
			initAsync: false,
			lng: language,
			fallbackLng: DEFAULT_LANGUAGE,
			resources: {
				[language]: { translation: messages },
				...(fallback && { [DEFAULT_LANGUAGE]: { translation: fallback } }),
			},
			interpolation: { escapeValue: false },
		});
		return instance;
	}, [language, messages, fallback]);

	return (
		<I18nextProvider i18n={i18n}>
			<LanguageContext value={language}>{children}</LanguageContext>
		</I18nextProvider>
	);
}

export const useLanguage = (): Language => React.use(LanguageContext);

export interface Formatters {
	// dayjs set to the current language (month and weekday names, relative times).
	date: (value?: ConfigType) => Dayjs;
	number: (value: number, options?: Intl.NumberFormatOptions) => string;
	count: (value: number) => string;
	bytes: (value: number) => string;
}

// Locale-aware formatting for the current language. dayjs's global locale is never changed:
// server rendering is shared between requests in different languages.
export function useFormat(): Formatters {
	const language = useLanguage();
	return React.useMemo(() => {
		const locale = dayjsLocale(language);
		return {
			date: (value) => dayjs(value).locale(locale),
			number: (value, options) => value.toLocaleString(language, options),
			count: (value) => formatCount(value, language),
			bytes: (value) => formatBytes(value, language),
		};
	}, [language]);
}
