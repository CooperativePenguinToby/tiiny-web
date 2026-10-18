"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import dayjs from "dayjs";

import type { DailySummary, MemorySettings } from "@/types/device";
import { postJson } from "@/lib/api";
import { responseError } from "@/lib/sse";
import { usePolling } from "@/hooks/use-polling";
import { ConfirmDialog } from "@/components/dashboard/settings/confirm-dialog";

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const pad = (value: number): string => String(value).padStart(2, "0");

function SummarySettings(): React.JSX.Element {
	const polled = usePolling<MemorySettings>("/api/vault/memory/settings", 60_000);
	const [draft, setDraft] = React.useState<{ modelId: string; time: string } | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);
	const settings = polled.data;

	if (!settings) {
		return polled.error ? (
			<Alert severity="error">{polled.error}</Alert>
		) : (
			<CircularProgress aria-label="Loading summary settings" />
		);
	}
	const value = draft ?? { modelId: settings.modelId, time: `${pad(settings.startHour)}:${pad(settings.startMinute)}` };
	const changed =
		draft !== null &&
		(draft.modelId !== settings.modelId || draft.time !== `${pad(settings.startHour)}:${pad(settings.startMinute)}`);

	const save = async (): Promise<void> => {
		const [startHour, startMinute] = value.time.split(":").map(Number);
		setSaving(true);
		setOutcome(null);
		try {
			const response = await fetch("/api/vault/memory/settings", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ modelId: value.modelId, startHour, startMinute }),
			});
			if (!response.ok) throw new Error(await responseError(response));
			await polled.refresh();
			setDraft(null);
			setOutcome({ severity: "success", message: "Summary settings saved." });
		} catch (error) {
			setOutcome({ severity: "error", message: errorMessage(error) });
		} finally {
			setSaving(false);
		}
	};

	return (
		<Stack spacing={2}>
			<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
				<Typography variant="body2">Daily summaries:</Typography>
				<Chip
					color={settings.enabled ? "success" : "default"}
					data-testid="summary-state"
					label={settings.enabled ? "On" : "Off"}
					size="small"
				/>
			</Stack>
			<Stack direction={{ sm: "row", xs: "column" }} spacing={2}>
				<FormControl size="small" sx={{ minWidth: 260 }}>
					<InputLabel id="summary-model-label" shrink>
						Summary model
					</InputLabel>
					<Select
						displayEmpty
						label="Summary model"
						notched
						labelId="summary-model-label"
						onChange={(event) => setDraft({ ...value, modelId: event.target.value })}
						value={value.modelId}
					>
						<MenuItem value="">Off</MenuItem>
						{settings.models.map((model) => (
							<MenuItem key={model.modelId} value={model.modelId}>
								{model.name}
							</MenuItem>
						))}
					</Select>
				</FormControl>
				<TextField
					label="Daily at"
					onChange={(event) => setDraft({ ...value, time: event.target.value })}
					size="small"
					slotProps={{ htmlInput: { step: 60 }, inputLabel: { shrink: true } }}
					type="time"
					value={value.time}
				/>
				<Button disabled={!changed || saving || !value.time} onClick={() => void save()} variant="contained">
					{saving ? "Saving…" : "Save"}
				</Button>
			</Stack>
			<Typography color="text.secondary" variant="caption">
				Each day the device summarises the day&apos;s conversations into Vault, so models can recall them in Task mode.
				It loads the summary model while it works.
			</Typography>
			{outcome ? (
				<Alert onClose={() => setOutcome(null)} severity={outcome.severity}>
					{outcome.message}
				</Alert>
			) : null}
		</Stack>
	);
}

function SummaryItem({ summary, onDelete }: { summary: DailySummary; onDelete: () => void }): React.JSX.Element {
	const [text, setText] = React.useState<string | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [open, setOpen] = React.useState(false);

	const toggle = async (): Promise<void> => {
		if (open) {
			setOpen(false);
			return;
		}
		setOpen(true);
		if (text !== null) return;
		try {
			const response = await fetch(`/api/vault/memory/summary?id=${encodeURIComponent(summary.sourceId)}`);
			if (!response.ok) throw new Error(await responseError(response));
			const body = (await response.json()) as { text: string };
			setText(body.text);
		} catch (error_) {
			setError(errorMessage(error_));
		}
	};

	return (
		<Stack data-testid={`summary-${summary.day}`} spacing={1}>
			<Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
				<Typography variant="subtitle2">{dayjs(summary.day).format("dddd D MMMM YYYY")}</Typography>
				<Stack direction="row">
					<Button onClick={() => void toggle()} size="small">
						{open ? "Hide" : "Read"}
					</Button>
					<Button color="error" onClick={onDelete} size="small">
						Delete
					</Button>
				</Stack>
			</Stack>
			{open ? (
				error ? (
					<Alert severity="error">{error}</Alert>
				) : text === null ? (
					<CircularProgress aria-label="Loading summary" size={20} />
				) : (
					<Typography data-testid="summary-text" sx={{ whiteSpace: "pre-wrap" }} variant="body2">
						{text}
					</Typography>
				)
			) : (
				<Typography
					color="text.secondary"
					sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
					variant="body2"
				>
					{summary.preview}
				</Typography>
			)}
		</Stack>
	);
}

export function VaultMemory(): React.JSX.Element {
	const polled = usePolling<DailySummary[]>("/api/vault/memory", 60_000);
	const [deleting, setDeleting] = React.useState<DailySummary | null>(null);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);

	return (
		<Stack spacing={3}>
			<Card data-testid="vault-summary-settings">
				<CardHeader title="Daily summaries" />
				<Divider />
				<CardContent>
					<SummarySettings />
				</CardContent>
			</Card>
			<Card data-testid="vault-summaries">
				<CardHeader subheader="Summaries of past conversations, kept in Vault" title="Chat history" />
				<Divider />
				<CardContent>
					<Stack spacing={2}>
						{outcome ? (
							<Alert onClose={() => setOutcome(null)} severity={outcome.severity}>
								{outcome.message}
							</Alert>
						) : null}
						{polled.error ? <Alert severity={polled.data ? "warning" : "error"}>{polled.error}</Alert> : null}
						{polled.data === null ? (
							polled.isLoading ? (
								<CircularProgress aria-label="Loading chat history" />
							) : null
						) : polled.data.length === 0 ? (
							<Typography color="text.secondary" variant="body2">
								No summaries yet.
							</Typography>
						) : (
							<Stack divider={<Divider />} spacing={2}>
								{polled.data.map((summary) => (
									<SummaryItem key={summary.sourceId} onDelete={() => setDeleting(summary)} summary={summary} />
								))}
							</Stack>
						)}
					</Stack>
				</CardContent>
			</Card>
			<ConfirmDialog
				confirmLabel="Delete"
				onCancel={() => setDeleting(null)}
				onConfirm={() => {
					const summary = deleting!;
					setDeleting(null);
					void postJson("/api/vault/delete", { sourceId: summary.sourceId })
						.then(() => setOutcome({ severity: "success", message: `Summary of ${summary.day} deleted.` }))
						.catch((error: unknown) => setOutcome({ severity: "error", message: errorMessage(error) }))
						.finally(() => void polled.refresh());
				}}
				open={deleting !== null}
				text={`Delete the summary of ${deleting?.day ?? ""}? Models will no longer recall that day's conversations.`}
				title="Delete summary?"
			/>
		</Stack>
	);
}
