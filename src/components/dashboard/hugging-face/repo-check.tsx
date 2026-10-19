"use client";

import * as React from "react";
import RouterLink from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type { HfInspection, ImportEvent } from "@/types/device";
import { paths } from "@/paths";
import { formatBytes } from "@/lib/format";
import { readSse, responseError } from "@/lib/sse";

interface ImportState {
	importId: string | null;
	stage: string;
	percent: number;
	bytes: string;
}

const DONE_STATUSES = new Set(["completed", "complete", "success", "succeeded", "done", "imported"]);
const FAILED_STATUSES = new Set(["failed", "error", "cancelled", "canceled", "cancel_requested"]);

const errorText = (event: ImportEvent): string =>
	typeof event.error === "string" ? event.error : (event.error?.message ?? event.message ?? "Import failed");

export interface RepoCheckHandle {
	check: (repo: string) => void;
}

export const RepoCheck = React.forwardRef<RepoCheckHandle>(function RepoCheck(_, ref): React.JSX.Element {
	const [repo, setRepo] = React.useState<string>("");
	const [checking, setChecking] = React.useState<boolean>(false);
	const [verdict, setVerdict] = React.useState<HfInspection | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [importing, setImporting] = React.useState<ImportState | null>(null);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "info" | "error"; message: string } | null>(
		null
	);

	const check = React.useCallback(async (value: string): Promise<void> => {
		setRepo(value);
		setVerdict(null);
		setError(null);
		setOutcome(null);
		setChecking(true);
		try {
			const response = await fetch("/api/hf/inspect", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ repo: value }),
			});
			if (!response.ok) throw new Error(await responseError(response));
			setVerdict((await response.json()) as HfInspection);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : String(error_));
		} finally {
			setChecking(false);
		}
	}, []);

	React.useImperativeHandle(ref, () => ({ check: (value) => void check(value) }), [check]);

	const startImport = async (target: HfInspection): Promise<void> => {
		setOutcome(null);
		setImporting({ importId: null, stage: "Starting", percent: 0, bytes: "" });
		try {
			const response = await fetch("/api/hf/import", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ repo: target.repoId, lora: target.isLora, baseModelId: target.baseModelId }),
			});
			if (!response.ok) throw new Error(await responseError(response));
			for await (const { event, data } of readSse(response)) {
				const update = JSON.parse(data) as ImportEvent;
				const status = update.import_status ?? "";
				if (event === "error" || update.error || FAILED_STATUSES.has(status)) {
					throw new Error(status.startsWith("cancel") ? "Import cancelled." : errorText(update));
				}
				if (event === "done" || DONE_STATUSES.has(status)) {
					setOutcome({ severity: "success", message: `${target.repoId} imported. Load it from the Models page.` });
					return;
				}
				setImporting({
					importId: update.import_id ?? null,
					stage: update.message || update.stage_name || update.stage || "Importing",
					percent: update.global_progress ?? 0,
					bytes:
						update.total_bytes && update.total_bytes > 0
							? `${formatBytes(update.downloaded_bytes ?? 0)} of ${formatBytes(update.total_bytes)}`
							: "",
				});
			}
			setOutcome({
				severity: "info",
				message: "Progress updates stopped. The import may still be running on the device.",
			});
		} catch (error_) {
			const message = error_ instanceof Error ? error_.message : String(error_);
			setOutcome({ severity: message === "Import cancelled." ? "info" : "error", message });
		} finally {
			setImporting(null);
		}
	};

	const cancelImport = async (): Promise<void> => {
		if (!importing?.importId) return;
		const response = await fetch("/api/hf/import/cancel", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ importId: importing.importId }),
		});
		if (!response.ok) setOutcome({ severity: "error", message: await responseError(response) });
	};

	return (
		<Card>
			<CardHeader subheader="The device decides whether it can import a repo." title="Check a repo" />
			<Divider />
			<CardContent>
				<Stack spacing={2}>
					<Stack
						component="form"
						direction={{ xs: "column", sm: "row" }}
						onSubmit={(event) => {
							event.preventDefault();
							void check(repo);
						}}
						spacing={2}
					>
						<TextField
							disabled={checking || importing !== null}
							fullWidth
							label="Hugging Face repo"
							onChange={(event) => setRepo(event.target.value)}
							placeholder="org/name or https://huggingface.co/org/name"
							value={repo}
						/>
						<Button
							disabled={!repo.trim() || checking || importing !== null}
							sx={{ flexShrink: 0 }}
							type="submit"
							variant="contained"
						>
							{checking ? "Checking…" : "Check"}
						</Button>
					</Stack>
					{checking ? <LinearProgress aria-label="Checking repo" /> : null}
					{error ? <Alert severity="error">{error}</Alert> : null}
					{verdict ? (
						<Stack data-testid="hf-verdict" spacing={1.5}>
							<Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
								<Typography variant="subtitle1">{verdict.repoId}</Typography>
								<Chip
									color={
										{ compatible: "success", "needs-base-model": "warning", incompatible: "error" }[verdict.verdict] as
											"success" | "warning" | "error"
									}
									label={
										{
											compatible: "compatible",
											"needs-base-model": "needs base model",
											incompatible: "not compatible",
										}[verdict.verdict]
									}
									size="small"
								/>
								{verdict.isLora ? <Chip label="LoRA adapter" size="small" /> : null}
								{verdict.task ? <Chip label={verdict.task} size="small" variant="outlined" /> : null}
							</Stack>
							{verdict.verdict === "needs-base-model" && verdict.requiredBaseModel ? (
								<Alert
									action={
										<Button color="inherit" component={RouterLink} href={paths.dashboard.store} size="small">
											Store
										</Button>
									}
									severity="warning"
								>
									Importable once {verdict.requiredBaseModel.name} ({verdict.requiredBaseModel.modelId}) is downloaded
									to the device from the Store.
								</Alert>
							) : null}
							{verdict.verdict === "incompatible" ? (
								<Typography color="text.secondary" variant="body2">
									{verdict.reason ?? "The device cannot import this repo."}
									{verdict.reasonCode ? ` (${verdict.reasonCode})` : ""}
								</Typography>
							) : null}
							<Typography color="text.secondary" variant="body2">
								Size {formatBytes(verdict.sizeBytes)}
								{verdict.baseModelId ? ` · base model ${verdict.baseModelId}` : ""}
								{verdict.disk
									? ` · needs ${formatBytes(verdict.disk.requiredBytes)} of disk, ${formatBytes(verdict.disk.availableBytes)} free`
									: ""}
							</Typography>
							{verdict.supported && verdict.toolkit?.requiresDownload ? (
								<Alert severity="warning">
									Importing first downloads the {verdict.toolkit.id} toolkit to the device (
									{formatBytes(verdict.toolkit.sizeBytes)}).
								</Alert>
							) : null}
							{verdict.supported && verdict.disk && !verdict.disk.sufficient ? (
								<Alert severity="error">Not enough free disk space on the device.</Alert>
							) : null}
							{importing ? (
								<Stack spacing={1}>
									<Typography color="text.secondary" role="status" variant="body2">
										{importing.stage} · {importing.percent.toFixed(1)}%{importing.bytes ? ` · ${importing.bytes}` : ""}
									</Typography>
									<LinearProgress aria-label="import progress" value={importing.percent} variant="determinate" />
									<Typography color="text.secondary" variant="caption">
										The import runs on the device and continues if you leave this page.
									</Typography>
									<div>
										<Button
											color="error"
											disabled={!importing.importId}
											onClick={() => void cancelImport()}
											variant="outlined"
										>
											Cancel import
										</Button>
									</div>
								</Stack>
							) : verdict.supported ? (
								<div>
									<Button
										disabled={Boolean(verdict.disk && !verdict.disk.sufficient)}
										onClick={() => void startImport(verdict)}
										variant="contained"
									>
										Import to device
									</Button>
								</div>
							) : null}
						</Stack>
					) : null}
					{outcome ? (
						<Alert onClose={() => setOutcome(null)} severity={outcome.severity}>
							{outcome.message}
						</Alert>
					) : null}
				</Stack>
			</CardContent>
		</Card>
	);
});
