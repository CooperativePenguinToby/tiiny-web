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
import type { ParseKeys, TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type { DownloadEvent, StoreModel } from "@/types/device";
import { postJson } from "@/lib/api";
import { readSse, responseError } from "@/lib/sse";
import { useFormat, type Formatters } from "@/i18n/client";
import { usePolling } from "@/hooks/use-polling";

import { ModelDetailsDialog } from "./model-details";

interface Progress {
	modelId: string;
	// Translation key of the stage.
	stage: ParseKeys;
	percent: number | null;
}

const STAGE_LABELS: Record<string, ParseKeys> = {
	downloading: "models.store.stage.downloading",
	verifying: "models.store.stage.verifying",
	loading_image: "models.store.stage.installing",
};

// Resolves "paused" when the download was paused (downloading again resumes it).
async function downloadModel(
	modelId: string,
	onProgress: (stage: ParseKeys, percent: number | null) => void,
	t: TFunction
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
			throw new Error(
				update.error || update.message || t("models.store.deviceReported", { status: update.status ?? event })
			);
		}
		if (event === "done" || update.status === "downloaded") return "downloaded";
		if (update.status === "download_stop") return "paused";
		onProgress(STAGE_LABELS[update.stage ?? ""] ?? "models.store.stage.starting", update.progress ?? null);
	}
	throw new Error(t("models.store.streamEnded"));
}

// Orders strings by UTF-16 code units, exactly as `sort()` does without a compare function.
const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const statusChip = (model: StoreModel, t: TFunction, format: Formatters): React.JSX.Element => {
	const percent = format.number(model.progress, { maximumFractionDigits: 0 });
	if (model.status === "running") return <Chip color="success" label={t("models.store.status.loaded")} size="small" />;
	if (model.status === "downloaded")
		return <Chip color="info" label={t("models.store.status.downloaded")} size="small" />;
	if (model.status === "download_stop")
		return <Chip color="warning" label={t("models.store.status.paused", { percent })} size="small" />;
	return model.status === "downloading" ? (
		<Chip color="warning" label={t("models.store.status.downloading", { percent })} size="small" />
	) : (
		<Chip label={t("models.store.status.notDownloaded")} size="small" />
	);
};

export function StoreTable(): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	const { data, error, isLoading, refresh } = usePolling<StoreModel[]>("/api/store", 10_000);
	const [query, setQuery] = React.useState<string>("");
	const [type, setType] = React.useState<string>("all");
	const [progress, setProgress] = React.useState<Progress | null>(null);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);
	const [shown, setShown] = React.useState<StoreModel | null>(null);

	const types = React.useMemo(
		() => [...new Set((data ?? []).map((model) => model.type))].toSorted(byCodeUnits),
		[data]
	);
	const visible = React.useMemo(() => {
		const needle = query.trim().toLowerCase();
		return (data ?? []).filter(
			(model) =>
				(type === "all" || model.type === type) &&
				(!needle || `${model.modelId} ${model.description}`.toLowerCase().includes(needle))
		);
	}, [data, query, type]);

	if (isLoading) {
		return (
			<Stack sx={{ alignItems: "center", py: 8 }}>
				<CircularProgress aria-label={t("models.store.loading")} />
			</Stack>
		);
	}

	const download = async (model: StoreModel): Promise<void> => {
		setOutcome(null);
		setProgress({ modelId: model.modelId, stage: "models.store.stage.starting", percent: null });
		try {
			const result = await downloadModel(
				model.modelId,
				(stage, percent) => setProgress({ modelId: model.modelId, stage, percent }),
				t
			);
			setOutcome({
				severity: "success",
				message: t(result === "paused" ? "models.store.pausedDone" : "models.store.downloaded", { name: model.name }),
			});
		} catch (error_) {
			const reason = error_ instanceof Error ? error_.message : String(error_);
			setOutcome({ severity: "error", message: t("models.store.failed.download", { name: model.name, reason }) });
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
				message: t("models.store.failed.pause", {
					name: model.name,
					reason: error_ instanceof Error ? error_.message : String(error_),
				}),
			});
		}
	};

	const cancel = async (model: StoreModel): Promise<void> => {
		setOutcome(null);
		try {
			await postJson("/api/models/delete", { modelId: model.modelId });
			setOutcome({ severity: "success", message: t("models.store.cancelled", { name: model.name }) });
		} catch (error_) {
			setOutcome({
				severity: "error",
				message: t("models.store.failed.cancel", {
					name: model.name,
					reason: error_ instanceof Error ? error_.message : String(error_),
				}),
			});
		} finally {
			await refresh();
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
					<Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ p: 2 }}>
						<OutlinedInput
							inputProps={{ "aria-label": t("models.store.search") }}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={t("models.store.searchPlaceholder")}
							startAdornment={
								<InputAdornment position="start">
									<MagnifyingGlassIcon fontSize="var(--icon-fontSize-md)" />
								</InputAdornment>
							}
							sx={{ flex: "1 1 auto", maxWidth: 500 }}
							value={query}
						/>
						<FormControl sx={{ minWidth: 220 }}>
							<InputLabel id="store-type-label">{t("models.columns.type")}</InputLabel>
							<Select
								label={t("models.columns.type")}
								labelId="store-type-label"
								onChange={(event) => setType(event.target.value)}
								value={type}
							>
								<MenuItem value="all">{t("models.store.allTypes")}</MenuItem>
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
							{t("models.store.empty")}
						</Typography>
					) : (
						<Box sx={{ overflowX: "auto" }}>
							<Table aria-label={t("models.store.tableLabel")} sx={{ minWidth: 900 }}>
								<TableHead>
									<TableRow>
										<TableCell>{t("models.columns.model")}</TableCell>
										<TableCell>{t("models.columns.type")}</TableCell>
										<TableCell align="right">{t("models.columns.npuShare")}</TableCell>
										<TableCell>{t("models.columns.status")}</TableCell>
										<TableCell align="right" sx={{ width: 220 }}>
											{t("models.columns.action")}
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
														{model.trending ? (
															<Chip label={t("models.store.trending")} size="small" sx={{ ml: 1 }} />
														) : null}
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
												<TableCell align="right">
													{t("models.percent", { value: format.number(model.npuUsage) })}
												</TableCell>
												<TableCell>{statusChip(model, t, format)}</TableCell>
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
																{t(active.stage)}
																{active.percent === null
																	? ""
																	: ` ${t("models.percent", { value: format.number(active.percent, { maximumFractionDigits: 0 }) })}`}
															</Typography>
															<LinearProgress
																aria-label={t("models.store.downloadProgress")}
																value={active.percent ?? 0}
																variant={active.percent === null ? "indeterminate" : "determinate"}
															/>
															<Box>
																<Button onClick={() => void pause(model)} size="small">
																	{t("models.store.pause")}
																</Button>
															</Box>
														</Stack>
													) : model.status === "download_stop" ? (
														<Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
															<Button color="error" disabled={progress !== null} onClick={() => void cancel(model)}>
																{t("models.store.cancel")}
															</Button>
															<Button
																disabled={progress !== null}
																onClick={() => void download(model)}
																variant="contained"
															>
																{t("models.store.resume")}
															</Button>
														</Stack>
													) : model.status === "not_downloaded" ? (
														<Button
															disabled={progress !== null}
															onClick={() => void download(model)}
															variant="contained"
														>
															{t("models.store.download")}
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
