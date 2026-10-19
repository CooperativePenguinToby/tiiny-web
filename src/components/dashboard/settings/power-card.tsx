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
import { useTranslation } from "react-i18next";

import type { SystemUpdate } from "@/types/device";
import { postJson } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";

import { ConfirmDialog } from "./confirm-dialog";

type Outcome = { severity: "success" | "error" | "info"; message: string };

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Waits until the device has gone away and answered again (or, if it never seemed to go away, until
// it answers after a grace period). Throws `timeoutMessage` if it does not come back.
async function waitForRestart(timeoutMessage: string): Promise<void> {
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
	throw new Error(timeoutMessage);
}

function AutoPowerOn(): React.JSX.Element {
	const { t } = useTranslation();
	const [saving, setSaving] = React.useState(false);
	const [outcome, setOutcome] = React.useState<Outcome | null>(null);
	const set = async (isEnabled: boolean): Promise<void> => {
		setSaving(true);
		setOutcome(null);
		try {
			const { message } = await postJson<{ message: string }>("/api/settings/power", { autoPowerOn: isEnabled });
			setOutcome({ severity: "success", message: t("settings.power.autoPowerOn.deviceReply", { message }) });
		} catch (error) {
			setOutcome({ severity: "error", message: errorMessage(error) });
		} finally {
			setSaving(false);
		}
	};
	return (
		<Stack spacing={1}>
			<Typography variant="subtitle2">{t("settings.power.autoPowerOn.title")}</Typography>
			<Typography
				variant="body2"
				sx={{
					color: "text.secondary",
				}}
			>
				{t("settings.power.autoPowerOn.description")}
			</Typography>
			<Stack direction="row" spacing={1}>
				<Button disabled={saving} onClick={() => void set(true)} size="small" variant="outlined">
					{t("settings.power.autoPowerOn.turnOn")}
				</Button>
				<Button disabled={saving} onClick={() => void set(false)} size="small" variant="outlined">
					{t("settings.power.autoPowerOn.turnOff")}
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
	const { t } = useTranslation();
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
			<Typography variant="subtitle2">{t("settings.power.update.title")}</Typography>
			{update ? (
				<Typography data-testid="update-status" variant="body2">
					{checked
						? checked.updateAvailable
							? t("settings.power.update.available", {
									version: update.currentVersion,
									available: checked.availableVersion,
								})
							: t("settings.power.update.upToDate", { version: update.currentVersion })
						: t("settings.power.update.current", { version: update.currentVersion })}
				</Typography>
			) : status.error ? (
				<Alert severity="error">{status.error}</Alert>
			) : (
				<CircularProgress aria-label={t("settings.power.update.loading")} size={20} />
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
					<Typography variant="body2">{t("settings.power.update.inProgress", { state })}</Typography>
					<LinearProgress
						aria-label={t("settings.power.update.progress")}
						value={status.data?.progress ?? 0}
						variant="determinate"
					/>
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
					{t(busy === "check" ? "settings.power.update.checking" : "settings.power.update.check")}
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
						{t("settings.power.update.download")}
					</Button>
				) : null}
				{state === "prepared" ? (
					<Button disabled={busy !== null} onClick={() => setConfirmInstall(true)} variant="contained">
						{t("settings.power.update.install")}
					</Button>
				) : null}
			</Stack>
			<ConfirmDialog
				confirmLabel={t("settings.power.update.confirmLabel")}
				onCancel={() => setConfirmInstall(false)}
				onConfirm={() => {
					setConfirmInstall(false);
					void run("install", async () => {
						await postJson("/api/settings/update", { action: "install" });
						await onRestarting(t("settings.power.update.installing"));
					});
				}}
				open={confirmInstall}
				text={t("settings.power.update.confirmText")}
				title={t("settings.power.update.confirmTitle")}
			/>
		</Stack>
	);
}

export function PowerCard(): React.JSX.Element {
	const { t } = useTranslation();
	const [confirm, setConfirm] = React.useState<"restart" | "shutdown" | null>(null);
	const [outcome, setOutcome] = React.useState<Outcome | null>(null);
	const [restarting, setRestarting] = React.useState(false);

	const followRestart = async (message: string): Promise<void> => {
		setRestarting(true);
		setOutcome({ severity: "info", message });
		try {
			await waitForRestart(t("settings.power.power.notBack"));
			setOutcome({ severity: "success", message: t("settings.power.power.back") });
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
		await followRestart(t("settings.power.power.restarting"));
	};

	const shutdown = async (): Promise<void> => {
		setConfirm(null);
		try {
			await postJson("/api/settings/shutdown");
			setOutcome({ severity: "info", message: t("settings.power.power.shuttingDown") });
		} catch (error) {
			setOutcome({ severity: "error", message: errorMessage(error) });
		}
	};

	return (
		<Card data-testid="settings-power">
			<CardHeader subheader={t("settings.power.subheader")} title={t("settings.power.title")} />
			<Divider />
			<CardContent>
				<Stack spacing={3}>
					<AutoPowerOn />
					<UpdateSection onRestarting={followRestart} />
					<Stack spacing={1.5}>
						<Typography variant="subtitle2">{t("settings.power.power.title")}</Typography>
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
								{t("settings.power.power.restart")}
							</Button>
							<Button color="error" disabled={restarting} onClick={() => setConfirm("shutdown")} variant="outlined">
								{t("settings.power.power.shutDown")}
							</Button>
						</Stack>
					</Stack>
				</Stack>
			</CardContent>
			<ConfirmDialog
				confirmLabel={t(confirm === "shutdown" ? "settings.power.power.shutDown" : "settings.power.power.restart")}
				onCancel={() => setConfirm(null)}
				onConfirm={() => void (confirm === "shutdown" ? shutdown() : restart())}
				open={confirm !== null}
				text={t(confirm === "shutdown" ? "settings.power.power.shutDownText" : "settings.power.power.restartText")}
				title={t(confirm === "shutdown" ? "settings.power.power.shutDownTitle" : "settings.power.power.restartTitle")}
			/>
		</Card>
	);
}
