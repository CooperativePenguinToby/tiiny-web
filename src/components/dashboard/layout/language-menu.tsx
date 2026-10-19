"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { TranslateIcon } from "@phosphor-icons/react/dist/ssr/Translate";
import { useTranslation } from "react-i18next";

import { postJson } from "@/lib/api";
import { useLanguage } from "@/i18n/client";
import { LANGUAGES, type Language } from "@/i18n/languages";

export function LanguageMenu(): React.JSX.Element {
	const { t } = useTranslation();
	const router = useRouter();
	const language = useLanguage();
	const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
	const [pending, startTransition] = React.useTransition();
	const current = LANGUAGES.find(({ code }) => code === language);

	const choose = (code: Language): void => {
		setAnchor(null);
		if (code === language) return;
		startTransition(async () => {
			await postJson("/api/language", { language: code });
			router.refresh();
		});
	};

	return (
		<React.Fragment>
			<Button
				aria-label={t("nav.languageCurrent", { language: current?.name })}
				aria-haspopup="menu"
				aria-expanded={Boolean(anchor)}
				color="secondary"
				disabled={pending}
				onClick={(event) => {
					setAnchor(event.currentTarget);
				}}
				startIcon={<TranslateIcon fontSize="var(--icon-fontSize-md)" />}
			>
				{current?.name}
			</Button>
			<Menu
				anchorEl={anchor}
				onClose={() => {
					setAnchor(null);
				}}
				open={Boolean(anchor)}
			>
				{LANGUAGES.map(({ code, name }) => (
					<MenuItem
						key={code}
						lang={code}
						onClick={() => {
							choose(code);
						}}
						selected={code === language}
					>
						{name}
					</MenuItem>
				))}
			</Menu>
		</React.Fragment>
	);
}
