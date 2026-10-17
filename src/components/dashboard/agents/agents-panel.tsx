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

import type { Agent, AgentEvent } from "@/types/device";
import { formatBytes } from "@/lib/format";
import { readSse, responseError } from "@/lib/sse";
import { usePolling } from "@/hooks/use-polling";

interface Busy {
	appId: string;
	message: string;
	percent: number | null;
}

async function post(path: string, body: Record<string, string>): Promise<void> {
	const response = await fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) throw new Error(await responseError(response));
}

async function installAgent(
	appId: string,
	onProgress: (message: string, percent: number | null) => void
): Promise<void> {
	const response = await fetch("/api/agents/install", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ appId }),
	});
	if (!response.ok) throw new Error(await responseError(response));
	for await (const { event, data } of readSse(response)) {
		const update = JSON.parse(data) as AgentEvent;
		const failure =
			typeof update.error === "string" ? update.error : (update.error?.message ?? (event === "error" ? data : null));
		if (failure || update.status === "failed" || update.status === "error")
			throw new Error(failure ?? "Install failed");
		if (update.status === "completed" || event === "done") return;
		onProgress(update.message || update.phase || update.status || "Installing", update.overall_progress ?? null);
	}
}

const STATUS_COLORS: Record<string, "success" | "warning" | "error"> = {
	running: "success",
	starting: "warning",
	error: "error",
};
const STOPPABLE = new Set(["running", "starting", "error"]);

const agentUrl = (port: number): string => `https://${globalThis.location.hostname}:${port}/`;

function AgentIcon({ agent }: { agent: Agent }): React.JSX.Element {
	return (
		<Avatar alt="" src={agent.iconUrl ?? undefined} sx={{ height: 48, width: 48 }} variant="rounded">
			{agent.name.slice(0, 1)}
		</Avatar>
	);
}

function RecommendedModels({ agent }: { agent: Agent }): React.JSX.Element | null {
	if (agent.recommendedModels.length === 0) return null;
	return (
		<Typography color="text.secondary" variant="caption">
			Recommended model{agent.recommendedModels.length > 1 ? "s" : ""}: {agent.recommendedModels.join(", ")}
		</Typography>
	);
}

export function AgentsPanel(): React.JSX.Element {
	const { data, error, isLoading, refresh } = usePolling<Agent[]>("/api/agents", 10_000);
	const [busy, setBusy] = React.useState<Busy | null>(null);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);
	const [confirmDelete, setConfirmDelete] = React.useState<Agent | null>(null);

	const run = async (agent: Agent, label: string, action: () => Promise<void>, done: string): Promise<void> => {
		setOutcome(null);
		setBusy({ appId: agent.appId, message: label, percent: null });
		try {
			await action();
			setOutcome({ severity: "success", message: `${agent.name} ${done}.` });
		} catch (error_) {
			setOutcome({
				severity: "error",
				message: `${agent.name}: ${error_ instanceof Error ? error_.message : String(error_)}`,
			});
		} finally {
			setBusy(null);
			await refresh();
		}
	};

	if (isLoading) {
		return (
			<Stack sx={{ alignItems: "center", py: 8 }}>
				<CircularProgress aria-label="Loading agents" />
			</Stack>
		);
	}

	const agents = data ?? [];
	const installed = agents.filter((agent) => agent.service);
	const installable = agents.filter((agent) => agent.kind === "web" && !agent.service && agent.cloudVersion);
	const desktop = agents.filter((agent) => agent.kind === "desktop");

	const progress = (agent: Agent): React.JSX.Element | null =>
		busy?.appId === agent.appId ? (
			<Stack spacing={0.5} sx={{ width: "100%" }}>
				<Typography color="text.secondary" role="status" variant="caption">
					{busy.message}
					{busy.percent === null ? "" : ` ${busy.percent.toFixed(0)}%`}
				</Typography>
				<LinearProgress
					aria-label={`${agent.name} progress`}
					value={busy.percent ?? 0}
					variant={busy.percent === null ? "indeterminate" : "determinate"}
				/>
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
				<Typography variant="h6">On this device</Typography>
				{installed.length === 0 ? (
					<Typography color="text.secondary" variant="body2">
						No agents are installed on the device. Install one from the store below.
					</Typography>
				) : (
					<Grid container spacing={3}>
						{installed.map((agent) => {
							const service = agent.service!;
							const running = service.status === "running";
							const canOpen = running && service.port !== null && service.reachable && service.proxy?.listening;
							return (
								<Grid key={agent.appId} size={{ md: 6, xs: 12 }}>
									<Card data-testid={`agent-${service.id}`} sx={{ height: "100%" }}>
										<CardContent>
											<Stack direction="row" spacing={2}>
												<AgentIcon agent={agent} />
												<Stack spacing={0.5} sx={{ minWidth: 0 }}>
													<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
														<Typography variant="subtitle1">{agent.name}</Typography>
														<Chip
															color={STATUS_COLORS[service.status] ?? "default"}
															label={service.status}
															size="small"
														/>
													</Stack>
													<Typography color="text.secondary" variant="body2">
														{agent.description}
													</Typography>
													<Typography color="text.secondary" variant="caption">
														Version {service.version ?? "unknown"}
														{agent.cloudVersion && service.version && agent.cloudVersion !== service.version
															? ` · ${agent.cloudVersion} available`
															: ""}
													</Typography>
													<RecommendedModels agent={agent} />
													{service.status === "error" ? (
														<Typography color="error" variant="caption">
															The device reports this agent&apos;s containers have stopped unexpectedly. Start it again,
															or Stop to reset it.
														</Typography>
													) : null}
													{service.port !== null && !service.reachable ? (
														<Typography color="text.secondary" variant="caption">
															This agent only listens on the device itself, so it can&apos;t be opened from the network.
														</Typography>
													) : null}
													{service.proxy?.error ? (
														<Typography color="error" variant="caption">
															Proxy on port {service.port}: {service.proxy.error}
														</Typography>
													) : null}
												</Stack>
											</Stack>
										</CardContent>
										<CardActions sx={{ flexWrap: "wrap", gap: 1, px: 2, pb: 2 }}>
											{progress(agent) ?? (
												<React.Fragment>
													{canOpen ? (
														<Button
															component="a"
															href={agentUrl(service.port!)}
															rel="noreferrer"
															target="_blank"
															variant="contained"
														>
															Open
														</Button>
													) : null}
													{STOPPABLE.has(service.status) ? (
														<Button
															disabled={busy !== null}
															onClick={() =>
																void run(
																	agent,
																	"Stopping…",
																	() => post("/api/agents/stop", { serviceId: service.id }),
																	"stopped"
																)
															}
														>
															Stop
														</Button>
													) : null}
													{running || service.status === "starting" ? null : (
														<Button
															disabled={busy !== null}
															onClick={() =>
																void run(
																	agent,
																	"Starting…",
																	() => post("/api/agents/start", { serviceId: service.id }),
																	"started"
																)
															}
															variant="outlined"
														>
															Start
														</Button>
													)}
													<Button color="error" disabled={busy !== null} onClick={() => setConfirmDelete(agent)}>
														Delete
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
				<Typography variant="h6">Agent store: run on the device</Typography>
				{installable.length === 0 ? (
					<Typography color="text.secondary" variant="body2">
						Every web agent from the store is already installed.
					</Typography>
				) : (
					<Grid container spacing={3}>
						{installable.map((agent) => (
							<Grid key={agent.appId} size={{ md: 6, lg: 4, xs: 12 }}>
								<Card data-testid={`store-agent-${agent.appId}`} sx={{ height: "100%" }}>
									<CardContent>
										<Stack direction="row" spacing={2}>
											<AgentIcon agent={agent} />
											<Stack spacing={0.5} sx={{ minWidth: 0 }}>
												<Typography variant="subtitle1">{agent.name}</Typography>
												<Typography color="text.secondary" variant="body2">
													{agent.description}
												</Typography>
												<Typography color="text.secondary" variant="caption">
													Version {agent.cloudVersion}
												</Typography>
												<RecommendedModels agent={agent} />
											</Stack>
										</Stack>
									</CardContent>
									<CardActions sx={{ px: 2, pb: 2 }}>
										{progress(agent) ?? (
											<Button
												disabled={busy !== null}
												onClick={() =>
													void run(
														agent,
														"Starting install…",
														() =>
															installAgent(agent.appId, (message, percent) =>
																setBusy({ appId: agent.appId, message, percent })
															),
														"installed"
													)
												}
												variant="contained"
											>
												Install on device
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
				<Typography variant="h6">Agent store: run on your computer</Typography>
				<Typography color="text.secondary" variant="body2">
					These agents run on a computer and use the device&apos;s OpenAI-compatible API. Point them at the device (for
					example <code>http://&lt;device address&gt;/v1</code>) with the key from <code>tiiny auth key</code>.
				</Typography>
				<Grid container spacing={3}>
					{desktop.map((agent) => (
						<Grid key={agent.appId} size={{ md: 6, lg: 4, xs: 12 }}>
							<Card data-testid={`desktop-agent-${agent.appId}`} sx={{ height: "100%" }}>
								<CardContent>
									<Stack direction="row" spacing={2}>
										<AgentIcon agent={agent} />
										<Stack spacing={0.5} sx={{ minWidth: 0 }}>
											<Typography variant="subtitle1">{agent.name}</Typography>
											<Typography color="text.secondary" variant="body2">
												{agent.description}
											</Typography>
											<RecommendedModels agent={agent} />
											{agent.downloads.length === 0 ? (
												<Typography color="text.secondary" variant="caption">
													No downloads published.
												</Typography>
											) : (
												agent.downloads.map((download) => (
													<Typography key={download.platform} variant="caption">
														<Link href={download.url} rel="noreferrer" target="_blank">
															{download.platform} {download.version}
														</Link>{" "}
														· {formatBytes(download.sizeBytes)}
														{download.sha256 ? (
															<span title={`SHA-256 ${download.sha256}`}>
																{" "}
																· sha256 {download.sha256.slice(0, 12)}…
															</span>
														) : null}
													</Typography>
												))
											)}
										</Stack>
									</Stack>
								</CardContent>
							</Card>
						</Grid>
					))}
				</Grid>
			</Stack>

			<Dialog onClose={() => setConfirmDelete(null)} open={confirmDelete !== null}>
				<DialogTitle>Delete {confirmDelete?.name}?</DialogTitle>
				<DialogContent>
					<DialogContentText>
						This removes the agent from the device. You can install it again from the agent store.
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
					<Button
						color="error"
						onClick={() => {
							const agent = confirmDelete;
							setConfirmDelete(null);
							if (agent?.service) {
								void run(
									agent,
									"Deleting…",
									() => post("/api/agents/delete", { serviceId: agent.service!.id }),
									"deleted"
								);
							}
						}}
						variant="contained"
					>
						Delete
					</Button>
				</DialogActions>
			</Dialog>
		</Stack>
	);
}
