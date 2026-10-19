"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import OutlinedInput from "@mui/material/OutlinedInput";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";

import type { DownloadEvent, StoreModel } from "@/types/device";
import { postJson } from "@/lib/api";
import { readSse, responseError } from "@/lib/sse";
import { usePolling } from "@/hooks/use-polling";

import { ModelDetailsDialog } from "./model-details";

interface Progress {
	modelId: string;
	stage: string;
	percent: number | null;
}

const STAGE_LABELS: Record<string, string> = {
	downloading: "Downloading",
	verifying: "Verifying",
	loading_image: "Installing",
};

// Resolves "paused" when the download was paused (downloading again resumes it).
async function downloadModel(
	modelId: string,
	onProgress: (stage: string, percent: number | null) => void
): Promise<"downloaded" | "paused"> {
	const response = await fetch("/api/store/download", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ modelId }),
	});
	if (!response.ok) throw new Error(await responseError(response));
	for await (const { event, data } of readSse(response)) {
		const update = JSON.parse(data) as DownloadEvent;
		if (event === "error" || update.error || update.status === "failed" || update.status === "error") {
			throw new Error(update.error || update.message || `Device reported ${update.status ?? event}`);
		}
		if (update.status === "downloaded" || event === "done") return "downloaded";
		if (update.status === "download_stop") return "paused";
		onProgress(STAGE_LABELS[update.stage ?? ""] ?? "Starting", update.progress ?? null);
	}
	throw new Error("The download stream ended before the model was downloaded");
}

const statusChip = (model: StoreModel): React.JSX.Element => {
	if (model.status === "running") return <Chip color="success" label="loaded" size="small" />;
	if (model.status === "downloaded") return <Chip color="info" label="downloaded" size="small" />;
	if (model.status === "download_stop")
		return <Chip color="warning" label={`paused ${model.progress.toFixed(0)}%`} size="small" />;
	if (model.status === "downloading")
		return <Chip color="warning" label={`downloading ${model.progress.toFixed(0)}%`} size="small" />;
	return <Chip label="not downloaded" size="small" />;
};

export function StoreTable(): React.JSX.Element {
	const { data, error, isLoading, refresh } = usePolling<StoreModel[]>("/api/store", 10_000);
	const [query, setQuery] = React.useState<string>("");
	const [type, setType] = React.useState<string>("all");
	const [progress, setProgress] = React.useState<Progress | null>(null);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);
	const [shown, setShown] = React.useState<StoreModel | null>(null);

	const types = React.useMemo(() => [...new Set((data ?? []).map((model) => model.type))].sort(), [data]);
	const visible = React.useMemo(() => {
		const needle = query.trim().toLowerCase();
		return (data ?? []).filter(
			(model) =>
				(type === "all" || model.type === type) &&
				(!needle || `${model.modelId} ${model.description}`.toLowerCase().includes(needle))
		);
	}, [data, query, type]);

	const download = async (model: StoreModel): Promise<void> => {
		setOutcome(null);
		setProgress({ modelId: model.modelId, stage: "Starting", percent: null });
		try {
			const result = await downloadModel(model.modelId, (stage, percent) =>
				setProgress({ modelId: model.modelId, stage, percent })
			);
			setOutcome(
				result === "paused"
					? { severity: "success", message: `${model.name} paused. Resume it any time.` }
					: { severity: "success", message: `${model.name} downloaded. Load it from the Models page.` }
			);
		} catch (error_) {
			const reason = error_ instanceof Error ? error_.message : String(error_);
			setOutcome({ severity: "error", message: `Could not download ${model.name}: ${reason}` });
		} finally {
			setProgress(null);
			await refresh();
		}
	};

	const pause = async (model: StoreModel): Promise<void> => {
		try {
			await postJson("/api/store/pause", { modelId: model.modelId });
		} catch (error_) {
			setOutcome({
				severity: "error",
				message: `Could not pause ${model.name}: ${error_ instanceof Error ? error_.message : String(error_)}`,
			});
		}
	};

	const cancel = async (model: StoreModel): Promise<void> => {
		setOutcome(null);
		try {
			await postJson("/api/models/delete", { modelId: model.modelId });
			setOutcome({ severity: "success", message: `Download of ${model.name} cancelled.` });
		} catch (error_) {
			setOutcome({
				severity: "error",
				message: `Could not cancel ${model.name}: ${error_ instanceof Error ? error_.message : String(error_)}`,
			});
		} finally {
			await refresh();
		}
	};

	if (isLoading) {
		return (
			<Stack sx={{ alignItems: "center", py: 8 }}>
				<CircularProgress aria-label="Loading store" />
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
					<Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ p: 2 }}>
						<OutlinedInput
							inputProps={{ "aria-label": "Search store" }}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search models"
							startAdornment={
								<InputAdornment position="start">
									<MagnifyingGlassIcon fontSize="var(--icon-fontSize-md)" />
								</InputAdornment>
							}
							sx={{ flex: "1 1 auto", maxWidth: 500 }}
							value={query}
						/>
						<FormControl sx={{ minWidth: 220 }}>
							<InputLabel id="store-type-label">Type</InputLabel>
							<Select
								label="Type"
								labelId="store-type-label"
								onChange={(event) => setType(event.target.value)}
								value={type}
							>
								<MenuItem value="all">All types</MenuItem>
								{types.map((option) => (
									<MenuItem key={option} value={option}>
										{option}
									</MenuItem>
								))}
							</Select>
						</FormControl>
					</Stack>
					<Divider />
					{visible.length === 0 ? (
						<Typography
							variant="body2"
							sx={{
								color: "text.secondary",
								p: 3,
							}}
						>
							No store models match your search.
						</Typography>
					) : (
						<Box sx={{ overflowX: "auto" }}>
							<Table aria-label="Store models" sx={{ minWidth: 900 }}>
								<TableHead>
									<TableRow>
										<TableCell>Model</TableCell>
										<TableCell>Type</TableCell>
										<TableCell align="right">NPU share</TableCell>
										<TableCell>Status</TableCell>
										<TableCell align="right" sx={{ width: 220 }}>
											Action
										</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{visible.map((model) => {
										const active = progress?.modelId === model.modelId ? progress : null;
										return (
											<TableRow hover key={model.modelId} data-testid={`store-${model.modelId}`}>
												<TableCell sx={{ maxWidth: 520 }}>
													<Typography variant="subtitle2">
														<Button
															onClick={() => setShown(model)}
															size="small"
															sx={{ font: "inherit", minWidth: 0, p: 0, textTransform: "none" }}
														>
															{model.name}
														</Button>
														{model.trending ? <Chip label="trending" size="small" sx={{ ml: 1 }} /> : null}
													</Typography>
													<Typography
														variant="body2"
														sx={{
															color: "text.secondary",
														}}
													>
														{model.modelId}
														{model.params ? ` · ${model.params}` : ""}
													</Typography>
													<Typography
														title={model.description}
														variant="caption"
														sx={{
															color: "text.secondary",
															display: "-webkit-box",
															overflow: "hidden",
															WebkitBoxOrient: "vertical",
															WebkitLineClamp: 2,
														}}
													>
														{model.description}
													</Typography>
												</TableCell>
												<TableCell>{model.type}</TableCell>
												<TableCell align="right">{model.npuUsage}%</TableCell>
												<TableCell>{statusChip(model)}</TableCell>
												<TableCell align="right">
													{active ? (
														<Stack spacing={0.5}>
															<Typography
																role="status"
																variant="caption"
																sx={{
																	color: "text.secondary",
																}}
															>
																{active.stage}
																{active.percent === null ? "" : ` ${active.percent.toFixed(0)}%`}
															</Typography>
															<LinearProgress
																aria-label="download progress"
																value={active.percent ?? 0}
																variant={active.percent === null ? "indeterminate" : "determinate"}
															/>
															<Box>
																<Button onClick={() => void pause(model)} size="small">
																	Pause
																</Button>
															</Box>
														</Stack>
													) : model.status === "download_stop" ? (
														<Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
															<Button color="error" disabled={progress !== null} onClick={() => void cancel(model)}>
																Cancel
															</Button>
															<Button
																disabled={progress !== null}
																onClick={() => void download(model)}
																variant="contained"
															>
																Resume
															</Button>
														</Stack>
													) : model.status === "not_downloaded" ? (
														<Button
															disabled={progress !== null}
															onClick={() => void download(model)}
															variant="contained"
														>
															Download
														</Button>
													) : null}
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
			<ModelDetailsDialog model={shown} onClose={() => setShown(null)} />
		</Stack>
	);
}
