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
import { useTranslation } from "react-i18next";

import type { HfInspection, ImportEvent } from "@/types/device";
import { paths } from "@/paths";
import { readSse, responseError } from "@/lib/sse";
import { useFormat } from "@/i18n/client";

interface ImportState {
	importId: string | null;
	stage: string;
	percent: number;
	bytes: string;
}

const DONE_STATUSES = new Set(["completed", "complete", "success", "succeeded", "done", "imported"]);
const FAILED_STATUSES = new Set(["failed", "error", "cancelled", "canceled", "cancel_requested"]);

const errorText = (event: ImportEvent, fallback: string): string =>
	typeof event.error === "string" ? event.error : (event.error?.message ?? event.message ?? fallback);

export interface RepositoryCheckHandle {
	check: (repository: string) => void;
}

export interface RepositoryCheckProperties {
	ref?: React.Ref<RepositoryCheckHandle>;
}

export function RepositoryCheck({ ref }: RepositoryCheckProperties): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	const [repository, setRepository] = React.useState<string>("");
	const [checking, setChecking] = React.useState<boolean>(false);
	const [verdict, setVerdict] = React.useState<HfInspection | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [importing, setImporting] = React.useState<ImportState | null>(null);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "info" | "error"; message: string } | null>(
		null
	);

	const check = React.useCallback(async (value: string): Promise<void> => {
		setRepository(value);
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
		const cancelled = t("models.huggingFace.check.cancelled");
		setOutcome(null);
		setImporting({ importId: null, stage: t("models.huggingFace.check.starting"), percent: 0, bytes: "" });
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
					throw new Error(
						status.startsWith("cancel") ? cancelled : errorText(update, t("models.huggingFace.check.importFailed"))
					);
				}
				if (event === "done" || DONE_STATUSES.has(status)) {
					setOutcome({ severity: "success", message: t("models.huggingFace.check.imported", { repo: target.repoId }) });
					return;
				}
				setImporting({
					importId: update.import_id ?? null,
					stage: update.message || update.stage_name || update.stage || t("models.huggingFace.check.importing"),
					percent: update.global_progress ?? 0,
					bytes:
						update.total_bytes && update.total_bytes > 0
							? t("models.huggingFace.check.bytes", {
									downloaded: format.bytes(update.downloaded_bytes ?? 0),
									total: format.bytes(update.total_bytes),
								})
							: "",
				});
			}
			setOutcome({
				severity: "info",
				message: t("models.huggingFace.check.streamStopped"),
			});
		} catch (error_) {
			const message = error_ instanceof Error ? error_.message : String(error_);
			setOutcome({ severity: message === cancelled ? "info" : "error", message });
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
			<CardHeader subheader={t("models.huggingFace.check.subheader")} title={t("models.huggingFace.check.title")} />
			<Divider />
			<CardContent>
				<Stack spacing={2}>
					<Stack
						component="form"
						direction={{ xs: "column", sm: "row" }}
						onSubmit={(event) => {
							event.preventDefault();
							void check(repository);
						}}
						spacing={2}
					>
						<TextField
							disabled={checking || importing !== null}
							fullWidth
							label={t("models.huggingFace.check.repo")}
							onChange={(event) => setRepository(event.target.value)}
							placeholder={t("models.huggingFace.check.placeholder")}
							value={repository}
						/>
						<Button
							disabled={!repository.trim() || checking || importing !== null}
							sx={{ flexShrink: 0 }}
							type="submit"
							variant="contained"
						>
							{t(checking ? "models.huggingFace.check.checking" : "models.huggingFace.check.check")}
						</Button>
					</Stack>
					{checking ? <LinearProgress aria-label={t("models.huggingFace.check.checkingRepo")} /> : null}
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
											compatible: t("models.huggingFace.verdict.compatible"),
											"needs-base-model": t("models.huggingFace.verdict.needsBaseModel"),
											incompatible: t("models.huggingFace.verdict.incompatible"),
										}[verdict.verdict]
									}
									size="small"
								/>
								{verdict.isLora ? <Chip label={t("models.huggingFace.kind.adapter")} size="small" /> : null}
								{verdict.task ? <Chip label={verdict.task} size="small" variant="outlined" /> : null}
							</Stack>
							{verdict.verdict === "needs-base-model" && verdict.requiredBaseModel ? (
								<Alert
									action={
										<Button color="inherit" component={RouterLink} href={paths.dashboard.store} size="small">
											{t("models.huggingFace.check.store")}
										</Button>
									}
									severity="warning"
								>
									{t("models.huggingFace.check.needsBase", {
										name: verdict.requiredBaseModel.name,
										modelId: verdict.requiredBaseModel.modelId,
									})}
								</Alert>
							) : null}
							{verdict.verdict === "incompatible" ? (
								<Typography
									variant="body2"
									sx={{
										color: "text.secondary",
									}}
								>
									{verdict.reason ?? t("models.huggingFace.check.cannotImport")}
									{verdict.reasonCode ? ` (${verdict.reasonCode})` : ""}
								</Typography>
							) : null}
							<Typography
								variant="body2"
								sx={{
									color: "text.secondary",
								}}
							>
								{t("models.huggingFace.check.size", { size: format.bytes(verdict.sizeBytes) })}
								{verdict.baseModelId
									? ` · ${t("models.huggingFace.check.baseModel", { modelId: verdict.baseModelId })}`
									: ""}
								{verdict.disk
									? ` · ${t("models.huggingFace.check.disk", {
											required: format.bytes(verdict.disk.requiredBytes),
											available: format.bytes(verdict.disk.availableBytes),
										})}`
									: ""}
							</Typography>
							{verdict.supported && verdict.toolkit?.requiresDownload ? (
								<Alert severity="warning">
									{t("models.huggingFace.check.toolkit", {
										toolkit: verdict.toolkit.id,
										size: format.bytes(verdict.toolkit.sizeBytes),
									})}
								</Alert>
							) : null}
							{verdict.supported && verdict.disk && !verdict.disk.sufficient ? (
								<Alert severity="error">{t("models.huggingFace.check.noDisk")}</Alert>
							) : null}
							{importing ? (
								<Stack spacing={1}>
									<Typography
										role="status"
										variant="body2"
										sx={{
											color: "text.secondary",
										}}
									>
										{importing.stage} ·{" "}
										{t("models.percent", {
											value: format.number(importing.percent, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
										})}
										{importing.bytes ? ` · ${importing.bytes}` : ""}
									</Typography>
									<LinearProgress
										aria-label={t("models.huggingFace.check.importProgress")}
										value={importing.percent}
										variant="determinate"
									/>
									<Typography
										variant="caption"
										sx={{
											color: "text.secondary",
										}}
									>
										{t("models.huggingFace.check.continues")}
									</Typography>
									<div>
										<Button
											color="error"
											disabled={!importing.importId}
											onClick={() => void cancelImport()}
											variant="outlined"
										>
											{t("models.huggingFace.check.cancelImport")}
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
										{t("models.huggingFace.check.import")}
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
}
