"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { BackupArchive, BackupCategory, RestoreEvent } from "@/types/device";
import { formatBytes } from "@/lib/format";
import { readSse, responseError } from "@/lib/sse";
import { usePolling } from "@/hooks/use-polling";

import { ConfirmDialog } from "./confirm-dialog";

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function BackupSection(): React.JSX.Element {
	const categories = usePolling<BackupCategory[]>("/api/backup", 60_000);
	const [chosen, setChosen] = React.useState<Set<string> | null>(null);
	const [busy, setBusy] = React.useState(false);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "warning" | "error"; message: string } | null>(
		null
	);
	const selected =
		chosen ?? new Set((categories.data ?? []).filter((category) => category.ready).map((category) => category.service));

	if (!categories.data) {
		return categories.error ? (
			<Alert severity="error">{categories.error}</Alert>
		) : (
			<CircularProgress aria-label="Loading backup" />
		);
	}

	const download = async (): Promise<void> => {
		setBusy(true);
		setOutcome(null);
		try {
			const response = await fetch("/api/backup/download", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ services: [...selected] }),
			});
			if (!response.ok) throw new Error(await responseError(response));
			const name =
				/filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "tiiny-backup.zip";
			const failures = JSON.parse(decodeURIComponent(response.headers.get("x-backup-failures") ?? "%7B%7D")) as Record<
				string,
				unknown
			>;
			const blob = await response.blob();
			const link = document.createElement("a");
			link.href = URL.createObjectURL(blob);
			link.download = name;
			link.click();
			URL.revokeObjectURL(link.href);
			const failed = Object.keys(failures);
			setOutcome(
				failed.length > 0
					? {
							severity: "warning",
							message: `Saved ${name} (${formatBytes(blob.size)}), without: ${failed.join(", ")}.`,
						}
					: { severity: "success", message: `Saved ${name} (${formatBytes(blob.size)}).` }
			);
		} catch (error) {
			setOutcome({ severity: "error", message: errorMessage(error) });
		} finally {
			setBusy(false);
		}
	};

	return (
		<Stack spacing={1.5}>
			<Typography variant="subtitle2">Back up</Typography>
			{categories.data.map((category) => (
				<FormControlLabel
					control={
						<Checkbox
							checked={selected.has(category.service)}
							disabled={!category.ready || busy}
							onChange={(event) => {
								const next = new Set(selected);
								if (event.target.checked) next.add(category.service);
								else next.delete(category.service);
								setChosen(next);
							}}
						/>
					}
					key={category.service}
					label={`${category.name} · about ${formatBytes(category.sizeBytes)}${category.ready ? "" : " (not ready)"}`}
				/>
			))}
			<Stack direction="row" spacing={1}>
				<Button disabled={busy || selected.size === 0} onClick={() => void download()} variant="contained">
					{busy ? "Backing up…" : "Download backup"}
				</Button>
			</Stack>
			{outcome ? (
				<Alert onClose={() => setOutcome(null)} severity={outcome.severity}>
					{outcome.message}
				</Alert>
			) : null}
		</Stack>
	);
}

function RestoreSection(): React.JSX.Element {
	const [file, setFile] = React.useState<File | null>(null);
	const [archive, setArchive] = React.useState<BackupArchive | null>(null);
	const [chosen, setChosen] = React.useState<Set<string>>(() => new Set());
	const [confirm, setConfirm] = React.useState(false);
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	// Each result keeps its arrival order as its id: results are only ever appended.
	const [results, setResults] = React.useState<(RestoreEvent & { sequence: number })[]>([]);

	const choose = async (picked: File): Promise<void> => {
		setFile(picked);
		setArchive(null);
		setResults([]);
		setError(null);
		try {
			const form = new FormData();
			form.append("file", picked);
			const response = await fetch("/api/backup/inspect", { method: "POST", body: form });
			if (!response.ok) throw new Error(await responseError(response));
			const inspected = (await response.json()) as BackupArchive;
			setArchive(inspected);
			setChosen(new Set(inspected.categories.map((category) => category.service)));
		} catch (error_) {
			setError(errorMessage(error_));
		}
	};

	const restore = async (): Promise<void> => {
		setConfirm(false);
		setBusy(true);
		setError(null);
		setResults([]);
		try {
			const form = new FormData();
			form.append("file", file!);
			form.append("services", JSON.stringify([...chosen]));
			const response = await fetch("/api/backup/restore", { method: "POST", body: form });
			if (!response.ok) throw new Error(await responseError(response));
			for await (const { event, data } of readSse(response)) {
				const update = JSON.parse(data) as RestoreEvent;
				if (event === "error") throw new Error(update.message ?? "The device could not restore the backup");
				setResults((current) => [...current, { ...update, sequence: current.length }]);
			}
		} catch (error_) {
			setError(errorMessage(error_));
		} finally {
			setBusy(false);
		}
	};

	const names = new Map(archive?.categories.map((category) => [category.service, category.name]));
	return (
		<Stack data-testid="restore-section" spacing={1.5}>
			<Typography variant="subtitle2">Restore</Typography>
			<Button component="label" disabled={busy} sx={{ alignSelf: "flex-start" }} variant="outlined">
				{file ? file.name : "Choose a backup file"}
				<input
					accept=".zip,application/zip"
					aria-label="Backup file"
					hidden
					onChange={(event) => {
						const picked = event.target.files?.[0];
						event.target.value = "";
						if (picked) void choose(picked);
					}}
					type="file"
				/>
			</Button>
			{archive ? (
				archive.sameDevice ? (
					<>
						{archive.categories.map((category) => (
							<FormControlLabel
								control={
									<Checkbox
										checked={chosen.has(category.service)}
										disabled={busy}
										onChange={(event) => {
											const next = new Set(chosen);
											if (event.target.checked) next.add(category.service);
											else next.delete(category.service);
											setChosen(next);
										}}
									/>
								}
								key={category.service}
								label={category.name}
							/>
						))}
						<Stack direction="row">
							<Button
								color="error"
								disabled={busy || chosen.size === 0}
								onClick={() => setConfirm(true)}
								variant="contained"
							>
								{busy ? "Restoring…" : "Restore"}
							</Button>
						</Stack>
					</>
				) : (
					<Alert severity="error">
						This backup was made on another device ({archive.deviceId ?? "unknown"}); it can only be restored there.
					</Alert>
				)
			) : null}
			{results.length > 0 ? (
				<Stack data-testid="restore-results" spacing={0.5}>
					{results.map((result) => (
						<Alert key={result.sequence} severity={result.code && result.code !== "ok" ? "error" : "success"}>
							{names.get(result.service ?? "") ?? result.service}: {result.message ?? "restored"}
						</Alert>
					))}
				</Stack>
			) : null}
			{error ? <Alert severity="error">{error}</Alert> : null}
			<ConfirmDialog
				confirmLabel="Restore"
				onCancel={() => setConfirm(false)}
				onConfirm={() => void restore()}
				open={confirm}
				text={`Replace ${[...chosen].map((service) => names.get(service) ?? service).join(" and ")} on the device with the backup's contents? What was added since the backup is lost.`}
				title="Restore backup?"
			/>
		</Stack>
	);
}

export function BackupCard(): React.JSX.Element {
	return (
		<Card data-testid="settings-backup">
			<CardHeader subheader="Chat history and Vault, saved to this computer" title="Backup & restore" />
			<Divider />
			<CardContent>
				<Stack divider={<Divider />} spacing={3}>
					<BackupSection />
					<RestoreSection />
				</Stack>
			</CardContent>
		</Card>
	);
}
