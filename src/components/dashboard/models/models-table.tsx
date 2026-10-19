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

import type { DownloadedModel, ModelList } from "@/types/device";
import { postJson } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { loadModel } from "@/lib/models";
import { responseError } from "@/lib/sse";
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
				message: { load: "Starting…", unload: "Unloading…", delete: "Deleting…" }[kind],
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
					message: `${model.name} ${{ load: "loaded", unload: "unloaded", delete: "deleted" }[kind]}.`,
				});
			} catch (error_) {
				const reason = error_ instanceof Error ? error_.message : String(error_);
				setOutcome({ severity: "error", message: `Could not ${kind} ${model.name}: ${reason}` });
			} finally {
				setOperation(null);
				await refresh();
			}
		},
		[refresh]
	);

	const [confirmUnloadAll, setConfirmUnloadAll] = React.useState(false);
	const [bulk, setBulk] = React.useState(false);

	const unloadAll = async (): Promise<void> => {
		setConfirmUnloadAll(false);
		setBulk(true);
		setOutcome(null);
		try {
			await postJson("/api/models/unload-all");
			setOutcome({ severity: "success", message: "All models unloaded." });
		} catch (error_) {
			setOutcome({
				severity: "error",
				message: `Could not unload all models: ${error_ instanceof Error ? error_.message : String(error_)}`,
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
			setOutcome({ severity: "success", message: `Stopped what ${model.name} was working on.` });
		} catch (error_) {
			setOutcome({
				severity: "error",
				message: `Could not interrupt ${model.name}: ${error_ instanceof Error ? error_.message : String(error_)}`,
			});
		}
	};

	if (isLoading) {
		return (
			<Stack sx={{ alignItems: "center", py: 8 }}>
				<CircularProgress aria-label="Loading models" />
			</Stack>
		);
	}

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
								disabled={operation !== null || bulk || !data.models.some((model) => model.status === "running")}
								onClick={() => setConfirmUnloadAll(true)}
							>
								{bulk ? "Unloading…" : "Unload all"}
							</Button>
						}
						subheader={`${data.npuAvailablePercent}% of the NPU is free`}
						title="Downloaded models"
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
							No models are downloaded on the device.
						</Typography>
					) : (
						<Box sx={{ overflowX: "auto" }}>
							<Table aria-label="Downloaded models" sx={{ minWidth: 800 }}>
								<TableHead>
									<TableRow>
										<TableCell>Model</TableCell>
										<TableCell>Type</TableCell>
										<TableCell align="right">Size</TableCell>
										<TableCell align="right">NPU share</TableCell>
										<TableCell>Status</TableCell>
										<TableCell align="right" sx={{ width: 240 }}>
											Action
										</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{data.models.map((model) => {
										const active = operation?.modelId === model.modelId ? operation : null;
										const running = model.status === "running";
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
												<TableCell align="right">{formatBytes(model.sizeBytes)}</TableCell>
												<TableCell align="right">{model.npuUsage}%</TableCell>
												<TableCell>
													<Chip
														color={running ? "success" : "default"}
														label={running ? "loaded" : "not loaded"}
														size="small"
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
																aria-label={`${active.kind} progress`}
																value={active.progress ?? 0}
																variant={active.progress === null ? "indeterminate" : "determinate"}
															/>
														</Stack>
													) : running ? (
														<Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
															<Button
																disabled={operation !== null || bulk}
																onClick={() => void interrupt(model)}
																title="Stop the requests this model is working on, from any app"
															>
																Interrupt
															</Button>
															<Button
																color="error"
																disabled={operation !== null || bulk}
																onClick={() => setConfirm({ model, kind: "unload" })}
																variant="outlined"
															>
																Unload
															</Button>
														</Stack>
													) : (
														<Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
															<Button
																color="error"
																disabled={operation !== null}
																onClick={() => setConfirm({ model, kind: "delete" })}
															>
																Delete
															</Button>
															<Button
																disabled={operation !== null}
																onClick={() => void run(model, "load")}
																variant="contained"
															>
																Load
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
				confirmLabel="Unload all"
				onCancel={() => setConfirmUnloadAll(false)}
				onConfirm={() => void unloadAll()}
				open={confirmUnloadAll}
				text="Every loaded model is released from the NPU. Requests in progress, from this app or other clients, stop."
				title="Unload all models?"
			/>
			<Dialog onClose={() => setConfirm(null)} open={confirm !== null}>
				<DialogTitle>
					{confirm?.kind === "delete" ? "Delete" : "Unload"} {confirm?.model.name}?
				</DialogTitle>
				<DialogContent>
					<DialogContentText>
						{confirm?.kind === "delete"
							? "This removes the model's files from the device. You can download it again from the store."
							: "This frees its NPU share. Any request currently using the model, from this app or other clients, will be stopped."}
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirm(null)}>Cancel</Button>
					<Button
						color="error"
						onClick={() => {
							const pending = confirm;
							setConfirm(null);
							if (pending) void run(pending.model, pending.kind);
						}}
						variant="contained"
					>
						{confirm?.kind === "delete" ? "Delete" : "Unload"}
					</Button>
				</DialogActions>
			</Dialog>
		</Stack>
	);
}
