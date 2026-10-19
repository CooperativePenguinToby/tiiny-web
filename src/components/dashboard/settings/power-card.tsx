"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { SystemUpdate } from "@/types/device";
import { postJson } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";

import { ConfirmDialog } from "./confirm-dialog";

type Outcome = { severity: "success" | "error" | "info"; message: string };

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Waits until the device has gone away and answered again (or, if it never seemed to go away, until
// it answers after a grace period).
async function waitForRestart(): Promise<void> {
	const started = Date.now();
	let isWentDown = false;
	while (Date.now() - started < 10 * 60_000) {
		await sleep(3000);
		let response: Response | null;
		try {
			response = await fetch("/api/settings/device", { cache: "no-store" });
		} catch {
			response = null;
		}
		if (!response?.ok) {
			isWentDown = true;
			continue;
		}
		if (isWentDown || Date.now() - started > 60_000) return;
	}
	throw new Error("The device has not come back after 10 minutes");
}

function AutoPowerOn(): React.JSX.Element {
	const [saving, setSaving] = React.useState(false);
	const [outcome, setOutcome] = React.useState<Outcome | null>(null);
	const set = async (isEnabled: boolean): Promise<void> => {
		setSaving(true);
		setOutcome(null);
		try {
			const { message } = await postJson<{ message: string }>("/api/settings/power", { autoPowerOn: isEnabled });
			setOutcome({ severity: "success", message: `Device: ${message}` });
		} catch (error) {
			setOutcome({ severity: "error", message: errorMessage(error) });
		} finally {
			setSaving(false);
		}
	};
	return (
		<Stack spacing={1}>
			<Typography variant="subtitle2">Auto power-on</Typography>
			<Typography
				variant="body2"
				sx={{
					color: "text.secondary",
				}}
			>
				The device turns on by itself when connected to power. The device does not report whether this is on (it always
				reads as off), so only the result of a change is shown.
			</Typography>
			<Stack direction="row" spacing={1}>
				<Button disabled={saving} onClick={() => void set(true)} size="small" variant="outlined">
					Turn on
				</Button>
				<Button disabled={saving} onClick={() => void set(false)} size="small" variant="outlined">
					Turn off
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

function UpdateSection({ onRestarting }: { onRestarting: (message: string) => Promise<void> }): React.JSX.Element {
	const status = usePolling<SystemUpdate>("/api/settings/update", 5000);
	const [checked, setChecked] = React.useState<SystemUpdate | null>(null);
	const [busy, setBusy] = React.useState<string | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [confirmInstall, setConfirmInstall] = React.useState(false);

	const run = async (label: string, action: () => Promise<void>): Promise<void> => {
		setBusy(label);
		setError(null);
		try {
			await action();
		} catch (error_) {
			setError(errorMessage(error_));
		} finally {
			setBusy(null);
		}
	};

	const update = checked ?? status.data;
	const state = status.data?.state ?? "idle";
	const isWorking = !["idle", "success", "failed", "prepared"].includes(state);

	return (
		<Stack spacing={1.5}>
			<Typography variant="subtitle2">System update</Typography>
			{update ? (
				<Typography data-testid="update-status" variant="body2">
					TiinyOS {update.currentVersion}
					{checked
						? checked.updateAvailable
							? ` · version ${checked.availableVersion} is available`
							: " · up to date"
						: ""}
				</Typography>
			) : status.error ? (
				<Alert severity="error">{status.error}</Alert>
			) : (
				<CircularProgress aria-label="Loading update status" size={20} />
			)}
			{checked?.updateAvailable ? (
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
						whiteSpace: "pre-wrap",
					}}
				>
					{checked.notes}
				</Typography>
			) : null}
			{isWorking ? (
				<Stack spacing={0.5}>
					<Typography variant="body2">Update {state}…</Typography>
					<LinearProgress aria-label="Update progress" value={status.data?.progress ?? 0} variant="determinate" />
				</Stack>
			) : null}
			{status.data?.error ? <Alert severity="warning">{status.data.error}</Alert> : null}
			{error ? <Alert severity="error">{error}</Alert> : null}
			<Stack direction="row" spacing={1}>
				<Button
					disabled={busy !== null || isWorking}
					onClick={() =>
						void run("check", async () => {
							setChecked(await postJson<SystemUpdate>("/api/settings/update", { action: "check" }));
						})
					}
					variant="outlined"
				>
					{busy === "check" ? "Checking…" : "Check for updates"}
				</Button>
				{state !== "prepared" && checked?.updateAvailable ? (
					<Button
						disabled={busy !== null || isWorking}
						onClick={() =>
							void run("download", async () => {
								await postJson("/api/settings/update", { action: "download" });
								await status.refresh();
							})
						}
						variant="contained"
					>
						Download update
					</Button>
				) : null}
				{state === "prepared" ? (
					<Button disabled={busy !== null} onClick={() => setConfirmInstall(true)} variant="contained">
						Install update
					</Button>
				) : null}
			</Stack>
			<ConfirmDialog
				confirmLabel="Install"
				onCancel={() => setConfirmInstall(false)}
				onConfirm={() => {
					setConfirmInstall(false);
					void run("install", async () => {
						await postJson("/api/settings/update", { action: "install" });
						await onRestarting("Installing the update. The device restarts once; don't unplug it.");
					});
				}}
				open={confirmInstall}
				text="Models stop and the device restarts during the installation. Don't unplug it until it is back."
				title="Install update?"
			/>
		</Stack>
	);
}

export function PowerCard(): React.JSX.Element {
	const [confirm, setConfirm] = React.useState<"restart" | "shutdown" | null>(null);
	const [outcome, setOutcome] = React.useState<Outcome | null>(null);
	const [restarting, setRestarting] = React.useState(false);

	const followRestart = async (message: string): Promise<void> => {
		setRestarting(true);
		setOutcome({ severity: "info", message });
		try {
			await waitForRestart();
			setOutcome({ severity: "success", message: "The device is back." });
		} catch (error) {
			setOutcome({ severity: "error", message: errorMessage(error) });
		} finally {
			setRestarting(false);
		}
	};

	const restart = async (): Promise<void> => {
		setConfirm(null);
		try {
			await postJson("/api/settings/reboot");
		} catch (error) {
			setOutcome({ severity: "error", message: errorMessage(error) });
			return;
		}
		await followRestart("Restarting… waiting for the device to come back.");
	};

	const shutdown = async (): Promise<void> => {
		setConfirm(null);
		try {
			await postJson("/api/settings/shutdown");
			setOutcome({ severity: "info", message: "The device is shutting down." });
		} catch (error) {
			setOutcome({ severity: "error", message: errorMessage(error) });
		}
	};

	return (
		<Card data-testid="settings-power">
			<CardHeader subheader="Power and TiinyOS updates" title="System" />
			<Divider />
			<CardContent>
				<Stack spacing={3}>
					<AutoPowerOn />
					<UpdateSection onRestarting={followRestart} />
					<Stack spacing={1.5}>
						<Typography variant="subtitle2">Power</Typography>
						{outcome ? (
							<Alert
								icon={restarting ? <CircularProgress size={18} /> : undefined}
								onClose={restarting ? undefined : () => setOutcome(null)}
								severity={outcome.severity}
							>
								{outcome.message}
							</Alert>
						) : null}
						<Stack direction="row" spacing={1}>
							<Button disabled={restarting} onClick={() => setConfirm("restart")} variant="outlined">
								Restart
							</Button>
							<Button color="error" disabled={restarting} onClick={() => setConfirm("shutdown")} variant="outlined">
								Shut down
							</Button>
						</Stack>
					</Stack>
				</Stack>
			</CardContent>
			<ConfirmDialog
				confirmLabel={confirm === "shutdown" ? "Shut down" : "Restart"}
				onCancel={() => setConfirm(null)}
				onConfirm={() => void (confirm === "shutdown" ? shutdown() : restart())}
				open={confirm !== null}
				text={
					confirm === "shutdown"
						? "Loaded models, chats and agents stop. The device stays off until it is turned on at the device (or reconnected to power with Auto power-on)."
						: "Loaded models, chats and agents stop, and the device is unreachable for a few minutes."
				}
				title={confirm === "shutdown" ? "Shut down the device?" : "Restart the device?"}
			/>
		</Card>
	);
}
