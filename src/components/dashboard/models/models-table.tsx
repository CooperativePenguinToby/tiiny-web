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

import type { DownloadedModel, LaunchEvent, ModelList } from "@/types/device";
import { formatBytes } from "@/lib/format";
import { readSse, responseError } from "@/lib/sse";
import { usePolling } from "@/hooks/use-polling";

interface Operation {
	modelId: string;
	kind: "load" | "unload";
	message: string;
	progress: number | null;
}

interface Outcome {
	severity: "success" | "error";
	message: string;
}

async function loadModel(
	modelId: string,
	onProgress: (message: string, progress: number | null) => void
): Promise<void> {
	const response = await fetch("/api/models/load", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ modelId }),
	});
	if (!response.ok) throw new Error(await responseError(response));
	for await (const { event, data } of readSse(response)) {
		const update = JSON.parse(data) as LaunchEvent;
		if (event === "error" || update.startup_error || update.status === "failed" || update.status === "error") {
			throw new Error(update.startup_error || update.result?.message || `Device reported ${update.status ?? event}`);
		}
		const progress = update.progress ?? update.result?.progress ?? null;
		onProgress(update.startup_message || update.result?.message || update.status || event, progress);
		if (update.status === "running" && progress === 100) return;
	}
}

async function unloadModel(modelId: string): Promise<void> {
	const response = await fetch("/api/models/unload", {
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
	const [confirmUnload, setConfirmUnload] = React.useState<DownloadedModel | null>(null);

	const run = React.useCallback(
		async (model: DownloadedModel, kind: Operation["kind"]): Promise<void> => {
			setOutcome(null);
			setOperation({
				modelId: model.modelId,
				kind,
				message: kind === "load" ? "Starting…" : "Unloading…",
				progress: null,
			});
			try {
				await (kind === "load"
					? loadModel(model.modelId, (message, progress) => {
							setOperation({ modelId: model.modelId, kind, message, progress });
						})
					: unloadModel(model.modelId));
				setOutcome({ severity: "success", message: `${model.name} ${kind === "load" ? "loaded" : "unloaded"}.` });
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
					<CardHeader subheader={`${data.npuAvailablePercent}% of the NPU is free`} title="Downloaded models" />
					<Divider />
					{data.models.length === 0 ? (
						<Typography color="text.secondary" sx={{ p: 3 }} variant="body2">
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
										<TableCell align="right" sx={{ width: 220 }}>
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
													<Typography color="text.secondary" variant="body2">
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
															<Typography color="text.secondary" variant="caption" role="status">
																{active.message}
															</Typography>
															<LinearProgress
																aria-label={`${active.kind} progress`}
																value={active.progress ?? 0}
																variant={active.progress === null ? "indeterminate" : "determinate"}
															/>
														</Stack>
													) : running ? (
														<Button
															color="error"
															disabled={operation !== null}
															onClick={() => setConfirmUnload(model)}
															variant="outlined"
														>
															Unload
														</Button>
													) : (
														<Button
															disabled={operation !== null}
															onClick={() => void run(model, "load")}
															variant="contained"
														>
															Load
														</Button>
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
			<Dialog onClose={() => setConfirmUnload(null)} open={confirmUnload !== null}>
				<DialogTitle>Unload {confirmUnload?.name}?</DialogTitle>
				<DialogContent>
					<DialogContentText>
						This frees its NPU share. Any request currently using the model, from this app or other clients, will be
						stopped.
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmUnload(null)}>Cancel</Button>
					<Button
						color="error"
						onClick={() => {
							const model = confirmUnload;
							setConfirmUnload(null);
							if (model) void run(model, "unload");
						}}
						variant="contained"
					>
						Unload
					</Button>
				</DialogActions>
			</Dialog>
		</Stack>
	);
}
