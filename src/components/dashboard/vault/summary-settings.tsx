"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type { MemorySettings } from "@/types/device";
import { responseError } from "@/lib/sse";
import { usePolling } from "@/hooks/use-polling";

const pad = (value: number): string => String(value).padStart(2, "0");
const DAY = 24 * 60;

// The device keeps its own clock (its UTC offset comes with the settings); the time is shown and entered
// in this browser's zone and converted both ways.
const browserOffset = (): number => -new Date().getTimezoneOffset();
const toLocal = (deviceMinutes: number, deviceOffset: number): number =>
	(((deviceMinutes - deviceOffset + browserOffset()) % DAY) + DAY) % DAY;
const toDevice = (localMinutes: number, deviceOffset: number): number =>
	(((localMinutes + deviceOffset - browserOffset()) % DAY) + DAY) % DAY;
const clock = (minutes: number): string => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const utcLabel = (offset: number): string =>
	`UTC${offset >= 0 ? "+" : "-"}${Math.floor(Math.abs(offset) / 60)}${Math.abs(offset) % 60 ? `:${pad(Math.abs(offset) % 60)}` : ""}`;

interface Draft {
	enabled: boolean;
	modelId: string;
	time: string;
}

// Daily summaries, as in TiinyOS: once a day the device summarises the day's chats into Vault.
export function SummarySettings(): React.JSX.Element {
	const polled = usePolling<MemorySettings>("/api/vault/memory/settings", 60_000);
	const [draft, setDraft] = React.useState<Draft | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);
	const settings = polled.data;

	if (!settings) {
		return (
			<Card>
				<CardContent>
					{polled.error ? (
						<Alert severity="error">{polled.error}</Alert>
					) : (
						<CircularProgress aria-label="Loading daily summaries" />
					)}
				</CardContent>
			</Card>
		);
	}
	const saved: Draft = {
		enabled: settings.enabled,
		modelId: settings.modelId,
		time: clock(toLocal(settings.startHour * 60 + settings.startMinute, settings.deviceOffsetMinutes)),
	};
	const value = draft ?? saved;
	// Turning summaries on needs a model; suggest the first one.
	const modelId = value.modelId || settings.models[0]?.modelId || "";
	const changed =
		draft !== null &&
		(draft.enabled !== saved.enabled || draft.time !== saved.time || (draft.enabled && modelId !== saved.modelId));
	const [hours, minutes] = value.time.split(":").map(Number);
	const deviceTime = Number.isNaN(hours) ? "" : clock(toDevice(hours * 60 + minutes, settings.deviceOffsetMinutes));

	const save = async (): Promise<void> => {
		const device = toDevice(hours * 60 + minutes, settings.deviceOffsetMinutes);
		setSaving(true);
		setOutcome(null);
		try {
			const response = await fetch("/api/vault/memory/settings", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					modelId: value.enabled ? modelId : "",
					startHour: Math.floor(device / 60),
					startMinute: device % 60,
				}),
			});
			if (!response.ok) throw new Error(await responseError(response));
			await polled.refresh();
			setDraft(null);
			setOutcome({
				severity: "success",
				message: value.enabled ? `Daily summaries on, at ${value.time}.` : "Daily summaries off.",
			});
		} catch (error) {
			setOutcome({ severity: "error", message: error instanceof Error ? error.message : String(error) });
		} finally {
			setSaving(false);
		}
	};

	return (
		<Card data-testid="summary-settings">
			<CardContent>
				<Stack spacing={2}>
					<Stack direction={{ sm: "row", xs: "column" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
						<FormControlLabel
							control={
								<Switch
									checked={value.enabled}
									onChange={(event) => setDraft({ ...value, enabled: event.target.checked })}
								/>
							}
							label="Daily summaries"
						/>
						<TextField
							disabled={!value.enabled}
							helperText={deviceTime ? `${deviceTime} on the device (${utcLabel(settings.deviceOffsetMinutes)})` : " "}
							label="Time"
							onChange={(event) => setDraft({ ...value, time: event.target.value })}
							size="small"
							slotProps={{ htmlInput: { step: 60 }, inputLabel: { shrink: true } }}
							type="time"
							value={value.time}
						/>
						<TextField
							disabled={!value.enabled}
							helperText=" "
							label="Model"
							onChange={(event) => setDraft({ ...value, modelId: event.target.value })}
							select
							size="small"
							sx={{ minWidth: 220 }}
							value={modelId}
						>
							{settings.models.map((model) => (
								<MenuItem key={model.modelId} value={model.modelId}>
									{model.name}
								</MenuItem>
							))}
						</TextField>
						<Button
							disabled={!changed || saving || !value.time || (value.enabled && !modelId)}
							onClick={() => void save()}
							sx={{ alignSelf: { sm: "flex-start" } }}
							variant="contained"
						>
							{saving ? "Saving…" : "Save"}
						</Button>
					</Stack>
					<Typography
						variant="caption"
						sx={{
							color: "text.secondary",
						}}
					>
						Each day the device summarises the day&apos;s conversations into Vault, so models can recall them in Task
						mode. It loads the model while it works, which can make that model busy for a while.
					</Typography>
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
