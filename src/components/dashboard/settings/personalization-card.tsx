"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";

import type { Personalization } from "@/types/device";
import { responseError } from "@/lib/sse";

const FIELDS: { key: keyof Personalization; label: ParseKeys; limit: number; multiline?: boolean; hint: ParseKeys }[] =
	[
		{
			key: "userName",
			label: "settings.personalization.fields.userName.label",
			limit: 30,
			hint: "settings.personalization.fields.userName.hint",
		},
		{
			key: "occupation",
			label: "settings.personalization.fields.occupation.label",
			limit: 50,
			hint: "settings.personalization.fields.occupation.hint",
		},
		{
			key: "preferences",
			label: "settings.personalization.fields.preferences.label",
			limit: 1000,
			multiline: true,
			hint: "settings.personalization.fields.preferences.hint",
		},
		{
			key: "recentFocus",
			label: "settings.personalization.fields.recentFocus.label",
			limit: 1000,
			multiline: true,
			hint: "settings.personalization.fields.recentFocus.hint",
		},
	];

type Loaded = { profile: Personalization } | { error: string };

// Fetches the saved profile, or the device's reason it could not.
async function loadProfile(): Promise<Loaded> {
	const response = await fetch("/api/personalization", { cache: "no-store" });
	return response.ok
		? { profile: (await response.json()) as Personalization }
		: { error: await responseError(response) };
}

export function PersonalizationCard(): React.JSX.Element {
	const { t } = useTranslation();
	const [saved, setSaved] = React.useState<Personalization | null>(null);
	const [draft, setDraft] = React.useState<Personalization | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [notice, setNotice] = React.useState<string | null>(null);

	const showLoaded = (loaded: Loaded): void => {
		if ("error" in loaded) {
			setError(loaded.error);
			return;
		}
		setSaved(loaded.profile);
		setDraft(loaded.profile);
	};

	React.useEffect(() => {
		void (async () => {
			showLoaded(await loadProfile());
		})();
	}, []);

	const retry = async (): Promise<void> => {
		setError(null);
		showLoaded(await loadProfile());
	};

	const save = async (): Promise<void> => {
		if (!draft) return;
		setSaving(true);
		setError(null);
		setNotice(null);
		try {
			const response = await fetch("/api/personalization", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(draft),
			});
			if (!response.ok) throw new Error(await responseError(response));
			const profile = (await response.json()) as Personalization;
			setSaved(profile);
			setDraft(profile);
			setNotice(t("settings.personalization.saved"));
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : String(error_));
		} finally {
			setSaving(false);
		}
	};

	const isChanged = draft !== null && saved !== null && FIELDS.some(({ key }) => draft[key] !== saved[key]);
	const isInvalid = draft !== null && FIELDS.some(({ key, limit }) => draft[key].length > limit);

	return (
		<Card data-testid="settings-personalization">
			<CardHeader subheader={t("settings.personalization.subheader")} title={t("settings.personalization.title")} />
			<Divider />
			<CardContent>
				{draft ? (
					<Stack spacing={2}>
						{FIELDS.map(({ key, label, limit, multiline, hint }) => (
							<TextField
								error={draft[key].length > limit}
								helperText={t("settings.personalization.fieldHelper", {
									hint: t(hint),
									length: draft[key].length,
									limit,
								})}
								key={key}
								label={t(label)}
								maxRows={8}
								minRows={multiline ? 3 : undefined}
								multiline={multiline}
								onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
								value={draft[key]}
							/>
						))}
						{error ? <Alert severity="error">{error}</Alert> : null}
						{notice ? (
							<Alert onClose={() => setNotice(null)} severity="success">
								{notice}
							</Alert>
						) : null}
						<Stack direction="row" spacing={1}>
							<Button disabled={!isChanged || isInvalid || saving} onClick={() => void save()} variant="contained">
								{t(saving ? "settings.actions.saving" : "settings.actions.save")}
							</Button>
							<Button disabled={!isChanged || saving} onClick={() => setDraft(saved)}>
								{t("settings.personalization.discardChanges")}
							</Button>
						</Stack>
					</Stack>
				) : error ? (
					<Alert
						action={
							<Button color="inherit" onClick={() => void retry()} size="small">
								{t("settings.actions.retry")}
							</Button>
						}
						severity="error"
					>
						{error}
					</Alert>
				) : (
					<Stack sx={{ alignItems: "center", py: 4 }}>
						<CircularProgress aria-label={t("settings.personalization.loading")} />
					</Stack>
				)}
			</CardContent>
		</Card>
	);
}
