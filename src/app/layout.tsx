import * as React from "react";
import type { Viewport } from "next";

import "@/styles/global.css";

import { I18nProvider } from "@/i18n/client";
import { DEFAULT_LANGUAGE } from "@/i18n/languages";
import { messages } from "@/i18n/resources";
import { getLanguage } from "@/i18n/server";
import { ThemeProvider } from "@/components/core/theme-provider/theme-provider";

export const viewport = { width: "device-width", initialScale: 1 } satisfies Viewport;

interface LayoutProperties {
	children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProperties): Promise<React.JSX.Element> {
	const language = await getLanguage();

	return (
		<html lang={language}>
			<body>
				<I18nProvider
					language={language}
					messages={messages[language]}
					fallback={language === DEFAULT_LANGUAGE ? undefined : messages[DEFAULT_LANGUAGE]}
				>
					<ThemeProvider>{children}</ThemeProvider>
				</I18nProvider>
			</body>
		</html>
	);
}
