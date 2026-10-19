"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { DownloadedModel, ModelList } from "@/types/device";
import { postJson } from "@/lib/api";
import { loadModel } from "@/lib/models";
import { responseError } from "@/lib/sse";
import { useFormat } from "@/i18n/client";
import { usePolling } from "@/hooks/use-polling";
import { ConfirmDialog } from "@/components/dashboard/settings/confirm-dialog";

interface Operation {
	modelId: string;
	kind: "load" | "unload" | "delete";
	message: string;
	progress: number | null;
}

interface Outcome {
	severity: "success" | "error";
	message: string;
}

async function postModel(action: "unload" | "delete", modelId: string): Promise<void> {
	const response = await fetch(`/api/models/${action}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ modelId }),
	});
	if (!response.ok) throw new Error(await responseError(response));
}

export function ModelsTable(): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	const { data, error, isLoading, refresh } = usePolling<ModelList>("/api/models", 5000);
	const [operation, setOperation] = React.useState<Operation | null>(null);
	const [outcome, setOutcome] = React.useState<Outcome | null>(null);
	const [confirm, setConfirm] = React.useState<{ model: DownloadedModel; kind: "unload" | "delete" } | null>(null);

	const run = React.useCallback(
		async (model: DownloadedModel, kind: Operation["kind"]): Promise<void> => {
			setOutcome(null);
			setOperation({
				modelId: model.modelId,
				kind,
				message: t(`models.table.pending.${kind}`),
				progress: null,
			});
			try {
				await (kind === "load"
					? loadModel(model.modelId, (message, progress) => {
							setOperation({ modelId: model.modelId, kind, message, progress });
						})
					: postModel(kind, model.modelId));
				setOutcome({
					severity: "success",
					message: t(`models.table.done.${kind}`, { name: model.name }),
				});
			} catch (error_) {
				const reason = error_ instanceof Error ? error_.message : String(error_);
				setOutcome({ severity: "error", message: t(`models.table.failed.${kind}`, { name: model.name, reason }) });
			} finally {
				setOperation(null);
				await refresh();
			}
		},
		[refresh, t]
	);

	const [confirmUnloadAll, setConfirmUnloadAll] = React.useState(false);
	const [bulk, setBulk] = React.useState(false);

	if (isLoading) {
		return (
			<Stack sx={{ alignItems: "center", py: 8 }}>
				<CircularProgress aria-label={t("models.table.loading")} />
			</Stack>
		);
	}

	const unloadAll = async (): Promise<void> => {
		setConfirmUnloadAll(false);
		setBulk(true);
		setOutcome(null);
		try {
			await postJson("/api/models/unload-all");
			setOutcome({ severity: "success", message: t("models.table.allUnloaded") });
		} catch (error_) {
			setOutcome({
				severity: "error",
				message: t("models.table.failed.unloadAll", {
					reason: error_ instanceof Error ? error_.message : String(error_),
				}),
			});
		} finally {
			setBulk(false);
			await refresh();
		}
	};

	const interrupt = async (model: DownloadedModel): Promise<void> => {
		setOutcome(null);
		try {
			await postJson("/api/models/interrupt", { modelId: model.modelId });
			setOutcome({ severity: "success", message: t("models.table.interrupted", { name: model.name }) });
		} catch (error_) {
			setOutcome({
				severity: "error",
				message: t("models.table.failed.interrupt", {
					name: model.name,
					reason: error_ instanceof Error ? error_.message : String(error_),
				}),
			});
		}
	};

	return (
		<Stack spacing={3}>
			{error ? <Alert severity={data ? "warning" : "error"}>{error}</Alert> : null}
			{outcome ? (
				<Alert onClose={() => setOutcome(null)} severity={outcome.severity}>
					{outcome.message}
				</Alert>
			) : null}
			{data ? (
				<Card>
					<CardHeader
						action={
							<Button
								color="error"
								disabled={operation !== null || bulk || data.models.every((model) => model.status !== "running")}
								onClick={() => setConfirmUnloadAll(true)}
							>
								{t(bulk ? "models.table.unloading" : "models.table.unloadAll")}
							</Button>
						}
						subheader={t("models.table.npuFree", { percent: format.number(data.npuAvailablePercent) })}
						title={t("models.table.title")}
					/>
					<Divider />
					{data.models.length === 0 ? (
						<Typography
							variant="body2"
							sx={{
								color: "text.secondary",
								p: 3,
							}}
						>
							{t("models.table.empty")}
						</Typography>
					) : (
						<Box sx={{ overflowX: "auto" }}>
							<Table aria-label={t("models.table.title")} sx={{ minWidth: 800 }}>
								<TableHead>
									<TableRow>
										<TableCell>{t("models.columns.model")}</TableCell>
										<TableCell>{t("models.columns.type")}</TableCell>
										<TableCell align="right">{t("models.columns.size")}</TableCell>
										<TableCell align="right">{t("models.columns.npuShare")}</TableCell>
										<TableCell>{t("models.columns.status")}</TableCell>
										<TableCell align="right" sx={{ width: 240 }}>
											{t("models.columns.action")}
										</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{data.models.map((model) => {
										const active = operation?.modelId === model.modelId ? operation : null;
										const isRunning = model.status === "running";
										const isTooBigForNpu = !isRunning && model.npuUsage > data.npuAvailablePercent;
										return (
											<TableRow hover key={model.modelId} data-testid={`model-${model.modelId}`}>
												<TableCell>
													<Typography variant="subtitle2">{model.name}</Typography>
													<Typography
														variant="body2"
														sx={{
															color: "text.secondary",
														}}
													>
														{model.modelId}
														{model.params ? ` · ${model.params}` : ""}
													</Typography>
												</TableCell>
												<TableCell>{model.type}</TableCell>
												<TableCell align="right">{format.bytes(model.sizeBytes)}</TableCell>
												<TableCell align="right">
													{t("models.percent", { value: format.number(model.npuUsage) })}
												</TableCell>
												<TableCell>
													<Chip
														color={isRunning ? "success" : isTooBigForNpu ? "warning" : "default"}
														label={t(
															isRunning
																? "models.table.status.loaded"
																: isTooBigForNpu
																	? "models.table.status.tooBig"
																	: "models.table.status.notLoaded"
														)}
														size="small"
														title={
															isTooBigForNpu
																? t("models.table.status.tooBigHint", {
																		needed: format.number(model.npuUsage),
																		free: format.number(data.npuAvailablePercent),
																	})
																: undefined
														}
													/>
												</TableCell>
												<TableCell align="right">
													{active ? (
														<Stack spacing={0.5} sx={{ alignItems: "stretch" }}>
															<Typography
																variant="caption"
																role="status"
																sx={{
																	color: "text.secondary",
																}}
															>
																{active.message}
															</Typography>
															<LinearProgress
																aria-label={t(`models.table.progress.${active.kind}`)}
																value={active.progress ?? 0}
																variant={active.progress === null ? "indeterminate" : "determinate"}
															/>
														</Stack>
													) : isRunning ? (
														<Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
															<Button
																disabled={operation !== null || bulk}
																onClick={() => void interrupt(model)}
																title={t("models.table.interruptHint")}
															>
																{t("models.table.interrupt")}
															</Button>
															<Button
																color="error"
																disabled={operation !== null || bulk}
																onClick={() => setConfirm({ model, kind: "unload" })}
																variant="outlined"
															>
																{t("models.table.unload")}
															</Button>
														</Stack>
													) : (
														<Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
															<Button
																color="error"
																disabled={operation !== null}
																onClick={() => setConfirm({ model, kind: "delete" })}
															>
																{t("models.table.delete")}
															</Button>
															<Button
																disabled={operation !== null || isTooBigForNpu}
																onClick={() => void run(model, "load")}
																variant="contained"
															>
																{t("models.table.load")}
															</Button>
														</Stack>
													)}
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</Box>
					)}
				</Card>
			) : null}
			<ConfirmDialog
				confirmLabel={t("models.table.unloadAll")}
				onCancel={() => setConfirmUnloadAll(false)}
				onConfirm={() => void unloadAll()}
				open={confirmUnloadAll}
				text={t("models.table.unloadAllDialog.text")}
				title={t("models.table.unloadAllDialog.title")}
			/>
			<Dialog onClose={() => setConfirm(null)} open={confirm !== null}>
				<DialogTitle>
					{confirm
						? t(confirm.kind === "delete" ? "models.table.deleteDialog.title" : "models.table.unloadDialog.title", {
								name: confirm.model.name,
							})
						: null}
				</DialogTitle>
				<DialogContent>
					<DialogContentText>
						{t(confirm?.kind === "delete" ? "models.table.deleteDialog.text" : "models.table.unloadDialog.text")}
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirm(null)}>{t("models.table.cancel")}</Button>
					<Button
						color="error"
						onClick={() => {
							const pending = confirm;
							setConfirm(null);
							if (pending) void run(pending.model, pending.kind);
						}}
						variant="contained"
					>
						{t(confirm?.kind === "delete" ? "models.table.delete" : "models.table.unload")}
					</Button>
				</DialogActions>
			</Dialog>
		</Stack>
	);
}
