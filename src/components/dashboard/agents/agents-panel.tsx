"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ParseKeys, TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";

import type { Agent, AgentEvent } from "@/types/device";
import { readSse, responseError } from "@/lib/sse";
import { useFormat } from "@/i18n/client";
import { usePolling } from "@/hooks/use-polling";

interface Busy {
	appId: string;
	message: string;
	percent: number | null;
	// Installs can be paused from the progress bar.
	installing?: boolean;
}

async function post(path: string, body: Record<string, string>): Promise<void> {
	const response = await fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) throw new Error(await responseError(response));
}

// Installs (or, with resume, continues installing) an agent; resolves "paused" if the install was paused.
async function installAgent(
	t: TFunction,
	appId: string,
	onProgress: (message: string, percent: number | null) => void,
	shouldResume = false
): Promise<"done" | "paused"> {
	const response = await fetch(shouldResume ? "/api/agents/install/resume" : "/api/agents/install", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ appId }),
	});
	return followAgentStream(t, response, onProgress);
}

// Follows the device's install or update stream until it reports completion.
async function followAgentStream(
	t: TFunction,
	response: Response,
	onProgress: (message: string, percent: number | null) => void
): Promise<"done" | "paused"> {
	if (!response.ok) throw new Error(await responseError(response));
	for await (const { event, data } of readSse(response)) {
		const update = JSON.parse(data) as AgentEvent;
		const failure =
			typeof update.error === "string" ? update.error : (update.error?.message ?? (event === "error" ? data : null));
		if (failure || update.status === "failed" || update.status === "error")
			throw new Error(failure ?? t("agents.stream.failed"));
		if (event === "done" || update.status === "completed") return "done";
		if (event === "paused") return "paused";
		onProgress(
			update.message || update.phase || update.status || t("agents.stream.working"),
			update.overall_progress ?? null
		);
	}
	return "done";
}

async function updateAgent(
	t: TFunction,
	serviceId: string,
	onProgress: (message: string, percent: number | null) => void
): Promise<void> {
	const response = await fetch("/api/agents/update", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ serviceId }),
	});
	await followAgentStream(t, response, onProgress);
}

// Cards in a row are equally tall; the content grows so every card's actions line up at the bottom.
const CARD_SX = { height: "100%", display: "flex", flexDirection: "column" } as const;
const CONTENT_SX = { flexGrow: 1 } as const;
const ACTIONS_SX = { flexWrap: "wrap", gap: 1, px: 2, pb: 2, pt: 0 } as const;

const STATUS_COLORS: Record<string, "success" | "warning" | "error"> = {
	running: "success",
	starting: "warning",
	error: "error",
};
const STOPPABLE = new Set(["running", "starting", "error"]);
// Labels for the container states the device reports; anything else is shown as the device says it.
const STATUS_LABELS: Partial<Record<string, ParseKeys>> = {
	created: "agents.status.created",
	running: "agents.status.running",
	starting: "agents.status.starting",
	stopped: "agents.status.stopped",
	exited: "agents.status.exited",
	paused: "agents.status.paused",
	error: "agents.status.error",
};

function statusLabel(t: TFunction, status: string): string {
	const key = STATUS_LABELS[status];
	return key ? t(key) : status;
}

// Through the agent's subdomain when configured (a one-time link signs that host in), else its port.
const agentUrl = (service: NonNullable<Agent["service"]>): string =>
	service.subdomain
		? `/api/agents/open?id=${encodeURIComponent(service.id)}`
		: `https://${location.hostname}:${service.port}/`;

function AgentIcon({ agent }: { agent: Agent }): React.JSX.Element {
	return (
		<Avatar alt="" src={agent.iconUrl ?? undefined} sx={{ height: 48, width: 48 }} variant="rounded">
			{agent.name.slice(0, 1)}
		</Avatar>
	);
}

function RecommendedModels({ agent }: { agent: Agent }): React.JSX.Element | null {
	const { t } = useTranslation();
	if (agent.recommendedModels.length === 0) return null;
	return (
		<Typography
			variant="caption"
			sx={{
				color: "text.secondary",
			}}
		>
			{t("agents.recommendedModels", {
				count: agent.recommendedModels.length,
				models: agent.recommendedModels.join(", "),
			})}
		</Typography>
	);
}

export function AgentsPanel(): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	const { data, error, isLoading, refresh } = usePolling<Agent[]>("/api/agents", 10_000);
	const [busy, setBusy] = React.useState<Busy | null>(null);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);
	const [confirmDelete, setConfirmDelete] = React.useState<Agent | null>(null);

	if (isLoading) {
		return (
			<Stack sx={{ alignItems: "center", py: 8 }}>
				<CircularProgress aria-label={t("agents.loading")} />
			</Stack>
		);
	}

	// `action` may resolve "paused" (an install that was paused), reported instead of `done`.
	const run = async (
		agent: Agent,
		label: string,
		action: () => Promise<unknown>,
		done: string,
		isInstall = false
	): Promise<void> => {
		setOutcome(null);
		setBusy({ appId: agent.appId, message: label, percent: null, installing: isInstall });
		try {
			const result = await action();
			setOutcome({
				severity: "success",
				message: result === "paused" ? t("agents.outcome.installPaused", { name: agent.name }) : done,
			});
		} catch (error_) {
			setOutcome({
				severity: "error",
				message: t("agents.outcome.error", {
					name: agent.name,
					message: error_ instanceof Error ? error_.message : String(error_),
				}),
			});
		} finally {
			setBusy(null);
			await refresh();
		}
	};

	const agents = data ?? [];
	const installed = agents.filter((agent) => agent.service);
	const installable = agents.filter((agent) => agent.kind === "web" && !agent.service && agent.cloudVersion);
	const desktop = agents.filter((agent) => agent.kind === "desktop");

	const pauseInstall = async (agent: Agent): Promise<void> => {
		try {
			await post("/api/agents/install/pause", { appId: agent.appId });
		} catch (error_) {
			setOutcome({
				severity: "error",
				message: t("agents.outcome.error", {
					name: agent.name,
					message: error_ instanceof Error ? error_.message : String(error_),
				}),
			});
		}
	};

	const install = (agent: Agent, shouldResume: boolean): Promise<void> =>
		run(
			agent,
			t(shouldResume ? "agents.progress.resumingInstall" : "agents.progress.startingInstall"),
			() =>
				installAgent(
					t,
					agent.appId,
					(message, percent) => setBusy({ appId: agent.appId, message, percent, installing: true }),
					shouldResume
				),
			t("agents.outcome.installed", { name: agent.name }),
			true
		);

	// An install in progress or paused: progress with Pause, or Resume and Cancel.
	const installState = (agent: Agent, state: NonNullable<Agent["install"]>): React.JSX.Element => (
		<Stack spacing={1} sx={{ width: "100%" }}>
			<Typography
				role="status"
				variant="caption"
				sx={{
					color: "text.secondary",
				}}
			>
				{t(state.state === "paused" ? "agents.install.paused" : "agents.install.running", {
					percent: format.number(state.percent, { maximumFractionDigits: 0 }),
				})}
			</Typography>
			<LinearProgress
				aria-label={t("agents.install.ariaLabel", { name: agent.name })}
				value={state.percent}
				variant="determinate"
			/>
			<Stack direction="row" spacing={1}>
				{state.state === "paused" ? (
					<Button disabled={busy !== null} onClick={() => void install(agent, true)} variant="contained">
						{t("agents.actions.resume")}
					</Button>
				) : (
					<Button disabled={busy !== null} onClick={() => void pauseInstall(agent)}>
						{t("agents.actions.pause")}
					</Button>
				)}
				<Button color="error" disabled={busy !== null} onClick={() => setConfirmDelete(agent)}>
					{t("agents.actions.cancelInstall")}
				</Button>
			</Stack>
		</Stack>
	);

	const progress = (agent: Agent): React.JSX.Element | null =>
		busy?.appId === agent.appId ? (
			<Stack spacing={0.5} sx={{ width: "100%" }}>
				<Typography
					role="status"
					variant="caption"
					sx={{
						color: "text.secondary",
					}}
				>
					{busy.percent === null
						? busy.message
						: t("agents.progress.percent", {
								message: busy.message,
								percent: format.number(busy.percent, { maximumFractionDigits: 0 }),
							})}
				</Typography>
				<LinearProgress
					aria-label={t("agents.progress.ariaLabel", { name: agent.name })}
					value={busy.percent ?? 0}
					variant={busy.percent === null ? "indeterminate" : "determinate"}
				/>
				{busy.installing ? (
					<Stack direction="row">
						<Button onClick={() => void pauseInstall(agent)} size="small">
							{t("agents.actions.pause")}
						</Button>
					</Stack>
				) : null}
			</Stack>
		) : null;

	return (
		<Stack spacing={4}>
			{error ? <Alert severity={data ? "warning" : "error"}>{error}</Alert> : null}
			{outcome ? (
				<Alert onClose={() => setOutcome(null)} severity={outcome.severity}>
					{outcome.message}
				</Alert>
			) : null}

			<Stack spacing={2}>
				<Typography variant="h6">{t("agents.installed.heading")}</Typography>
				{installed.length === 0 ? (
					<Typography
						variant="body2"
						sx={{
							color: "text.secondary",
						}}
					>
						{t("agents.installed.empty")}
					</Typography>
				) : (
					<Grid container spacing={3}>
						{installed.map((agent) => {
							const service = agent.service!;
							const isRunning = service.status === "running";
							const canOpen =
								isRunning && (service.subdomain !== null || (service.port !== null && service.proxy?.listening));
							return (
								<Grid key={agent.appId} size={{ md: 6, xs: 12 }}>
									<Card data-testid={`agent-${service.id}`} sx={CARD_SX}>
										<CardContent sx={CONTENT_SX}>
											<Stack direction="row" spacing={2}>
												<AgentIcon agent={agent} />
												<Stack spacing={0.5} sx={{ minWidth: 0 }}>
													<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
														<Typography variant="subtitle1">{agent.name}</Typography>
														<Chip
															color={STATUS_COLORS[service.status] ?? "default"}
															label={statusLabel(t, service.status)}
															size="small"
														/>
													</Stack>
													<Typography
														variant="body2"
														sx={{
															color: "text.secondary",
														}}
													>
														{agent.description}
													</Typography>
													<Typography
														variant="caption"
														sx={{
															color: "text.secondary",
														}}
													>
														{service.update
															? t("agents.installed.versionWithUpdate", {
																	version: service.version ?? t("agents.installed.unknownVersion"),
																	latest: service.update.latestVersion,
																})
															: t("agents.installed.version", {
																	version: service.version ?? t("agents.installed.unknownVersion"),
																})}
													</Typography>
													{isRunning && service.usage ? (
														<Typography
															data-testid="agent-usage"
															variant="caption"
															sx={{
																color: "text.secondary",
															}}
														>
															{t("agents.installed.usage", {
																cpu: format.number(service.usage.cpuPercent, {
																	minimumFractionDigits: 1,
																	maximumFractionDigits: 1,
																}),
																memory: format.bytes(service.usage.memoryBytes),
															})}
														</Typography>
													) : null}
													<RecommendedModels agent={agent} />
													{service.status === "error" ? (
														<Typography color="error" variant="caption">
															{t("agents.installed.containersStopped")}
														</Typography>
													) : null}
													{service.proxy?.error ? (
														<Typography color="error" variant="caption">
															{t("agents.installed.proxyError", {
																port: service.port,
																error: service.proxy.error,
															})}
														</Typography>
													) : null}
												</Stack>
											</Stack>
										</CardContent>
										<CardActions sx={ACTIONS_SX}>
											{progress(agent) ?? (agent.install ? installState(agent, agent.install) : null) ?? (
												<React.Fragment>
													{service.update ? (
														<Button
															disabled={busy !== null}
															onClick={() =>
																void run(
																	agent,
																	t("agents.progress.updating"),
																	() =>
																		updateAgent(t, service.id, (message, percent) =>
																			setBusy({ appId: agent.appId, message, percent })
																		),
																	t("agents.outcome.updated", {
																		name: agent.name,
																		version: service.update!.latestVersion,
																	})
																)
															}
															variant="outlined"
														>
															{t("agents.actions.update")}
														</Button>
													) : null}
													{canOpen ? (
														<Button
															component="a"
															href={agentUrl(service)}
															rel="noreferrer"
															target="_blank"
															variant="contained"
														>
															{t("agents.actions.open")}
														</Button>
													) : null}
													{STOPPABLE.has(service.status) ? (
														<Button
															disabled={busy !== null}
															onClick={() =>
																void run(
																	agent,
																	t("agents.progress.stopping"),
																	() => post("/api/agents/stop", { serviceId: service.id }),
																	t("agents.outcome.stopped", { name: agent.name })
																)
															}
														>
															{t("agents.actions.stop")}
														</Button>
													) : null}
													{isRunning || service.status === "starting" ? null : (
														<Button
															disabled={busy !== null}
															onClick={() =>
																void run(
																	agent,
																	t("agents.progress.starting"),
																	() => post("/api/agents/start", { serviceId: service.id }),
																	t("agents.outcome.started", { name: agent.name })
																)
															}
															variant="outlined"
														>
															{t("agents.actions.start")}
														</Button>
													)}
													<Button color="error" disabled={busy !== null} onClick={() => setConfirmDelete(agent)}>
														{t("agents.actions.delete")}
													</Button>
												</React.Fragment>
											)}
										</CardActions>
									</Card>
								</Grid>
							);
						})}
					</Grid>
				)}
			</Stack>

			<Stack spacing={2}>
				<Typography variant="h6">{t("agents.store.heading")}</Typography>
				{installable.length === 0 ? (
					<Typography
						variant="body2"
						sx={{
							color: "text.secondary",
						}}
					>
						{t("agents.store.allInstalled")}
					</Typography>
				) : (
					<Grid container spacing={3}>
						{installable.map((agent) => (
							<Grid key={agent.appId} size={{ md: 6, lg: 4, xs: 12 }}>
								<Card data-testid={`store-agent-${agent.appId}`} sx={CARD_SX}>
									<CardContent sx={CONTENT_SX}>
										<Stack direction="row" spacing={2}>
											<AgentIcon agent={agent} />
											<Stack spacing={0.5} sx={{ minWidth: 0 }}>
												<Typography variant="subtitle1">{agent.name}</Typography>
												<Typography
													variant="body2"
													sx={{
														color: "text.secondary",
													}}
												>
													{agent.description}
												</Typography>
												<Typography
													variant="caption"
													sx={{
														color: "text.secondary",
													}}
												>
													{t("agents.store.version", { version: agent.cloudVersion })}
												</Typography>
												<RecommendedModels agent={agent} />
											</Stack>
										</Stack>
									</CardContent>
									<CardActions sx={ACTIONS_SX}>
										{progress(agent) ?? (agent.install ? installState(agent, agent.install) : null) ?? (
											<Button disabled={busy !== null} onClick={() => void install(agent, false)} variant="contained">
												{t("agents.actions.installOnDevice")}
											</Button>
										)}
									</CardActions>
								</Card>
							</Grid>
						))}
					</Grid>
				)}
			</Stack>

			<Stack spacing={2}>
				<Typography variant="h6">{t("agents.desktop.heading")}</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					<Trans components={{ code: <code /> }} i18nKey="agents.desktop.description" shouldUnescape />
				</Typography>
				<Grid container spacing={3}>
					{desktop.map((agent) => (
						<Grid key={agent.appId} size={{ md: 6, lg: 4, xs: 12 }}>
							<Card data-testid={`desktop-agent-${agent.appId}`} sx={CARD_SX}>
								<CardContent sx={CONTENT_SX}>
									<Stack direction="row" spacing={2}>
										<AgentIcon agent={agent} />
										<Stack spacing={0.5} sx={{ minWidth: 0 }}>
											<Typography variant="subtitle1">{agent.name}</Typography>
											<Typography
												variant="body2"
												sx={{
													color: "text.secondary",
												}}
											>
												{agent.description}
											</Typography>
											<RecommendedModels agent={agent} />
										</Stack>
									</Stack>
								</CardContent>
								<CardActions sx={ACTIONS_SX}>
									<Stack spacing={0.5}>
										{agent.downloads.length === 0 ? (
											<Typography
												variant="caption"
												sx={{
													color: "text.secondary",
												}}
											>
												{t("agents.desktop.noDownloads")}
											</Typography>
										) : (
											agent.downloads.map((download) => (
												<Typography key={download.platform} variant="caption">
													<Link href={download.url} rel="noreferrer" target="_blank">
														{download.platform} {download.version}
													</Link>{" "}
													· {format.bytes(download.sizeBytes)}
													{download.sha256 ? (
														<span title={`SHA-256 ${download.sha256}`}> · sha256 {download.sha256.slice(0, 12)}…</span>
													) : null}
												</Typography>
											))
										)}
									</Stack>
								</CardActions>
							</Card>
						</Grid>
					))}
				</Grid>
			</Stack>

			<Dialog onClose={() => setConfirmDelete(null)} open={confirmDelete !== null}>
				<DialogTitle>{t("agents.deleteDialog.title", { name: confirmDelete?.name })}</DialogTitle>
				<DialogContent>
					<DialogContentText>{t("agents.deleteDialog.text")}</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmDelete(null)}>{t("agents.actions.cancel")}</Button>
					<Button
						color="error"
						onClick={() => {
							const agent = confirmDelete;
							setConfirmDelete(null);
							if (!agent) return;
							// An install paused before the device listed the agent is removed by its store id.
							const serviceId = agent.service?.id ?? agent.appId.replace(/^wa-/, "");
							void run(
								agent,
								t("agents.progress.deleting"),
								() => post("/api/agents/delete", { serviceId }),
								t("agents.outcome.deleted", { name: agent.name })
							);
						}}
						variant="contained"
					>
						{t("agents.actions.delete")}
					</Button>
				</DialogActions>
			</Dialog>
		</Stack>
	);
}
