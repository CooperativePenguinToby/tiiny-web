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
import Typography from "@mui/material/Typography";
import dayjs from "dayjs";

import type { DailySummary } from "@/types/device";
import { postJson } from "@/lib/api";
import { responseError } from "@/lib/sse";
import { usePolling } from "@/hooks/use-polling";
import { ConfirmDialog } from "@/components/dashboard/settings/confirm-dialog";

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

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
					variant="body2"
					sx={{
						color: "text.secondary",
						display: "-webkit-box",
						WebkitLineClamp: 2,
						WebkitBoxOrient: "vertical",
						overflow: "hidden",
					}}
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
			<Card data-testid="vault-summaries">
				<CardHeader subheader="Daily summaries of past conversations, kept in Vault." title="Chat history" />
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
							<Typography
								variant="body2"
								sx={{
									color: "text.secondary",
								}}
							>
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
