"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";

import type { DeviceInfo } from "@/types/device";
import { postJson } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";

import { CopyButton } from "./copy-button";
import { SectionState } from "./section-state";

const MAX_NAME = 30;

function NameEditor({ name, onSaved }: { name: string; onSaved: () => Promise<void> }): React.JSX.Element {
	const [value, setValue] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	if (value === null) {
		return (
			<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
				<span data-testid="device-name">{name}</span>
				<Button onClick={() => setValue(name)} size="small">
					Rename
				</Button>
			</Stack>
		);
	}
	const trimmed = value.trim();
	const invalid = trimmed.length === 0 || trimmed.length > MAX_NAME;
	const save = async (): Promise<void> => {
		setSaving(true);
		setError(null);
		try {
			await postJson("/api/settings/device-name", { name: trimmed });
			await onSaved();
			setValue(null);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : String(error_));
		} finally {
			setSaving(false);
		}
	};
	return (
		<Stack spacing={1}>
			<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
				<TextField
					error={invalid}
					helperText={`${trimmed.length}/${MAX_NAME}`}
					label="Device name"
					onChange={(event) => setValue(event.target.value)}
					size="small"
					value={value}
				/>
				<Button disabled={invalid || saving} onClick={() => void save()} variant="contained">
					Save
				</Button>
				<Button disabled={saving} onClick={() => setValue(null)}>
					Cancel
				</Button>
			</Stack>
			{error ? <Alert severity="error">{error}</Alert> : null}
		</Stack>
	);
}

export function DeviceCard(): React.JSX.Element {
	const polled = usePolling<DeviceInfo>("/api/settings/device", 30_000);
	return (
		<Card data-testid="settings-device">
			<CardHeader subheader="Reported by the device" title="My device" />
			<Divider />
			<CardContent>
				<SectionState label="device information" polled={polled}>
					{(device) => (
						<Table size="small">
							<TableBody>
								<TableRow>
									<TableCell component="th">Name</TableCell>
									<TableCell>
										<NameEditor name={device.name} onSaved={polled.refresh} />
									</TableCell>
								</TableRow>
								<TableRow>
									<TableCell component="th">Serial number</TableCell>
									<TableCell>
										<span data-testid="device-serial">{device.serial}</span>{" "}
										<CopyButton label="Copy serial number" text={device.serial} />
									</TableCell>
								</TableRow>
								<TableRow>
									<TableCell component="th">Model</TableCell>
									<TableCell data-testid="device-model">
										{device.model} ({device.modelDate})
									</TableCell>
								</TableRow>
								<TableRow>
									<TableCell component="th">TiinyOS service</TableCell>
									<TableCell data-testid="device-os">{device.os}</TableCell>
								</TableRow>
								{device.specs.map((spec) => (
									<TableRow key={spec.label}>
										<TableCell component="th">{spec.label}</TableCell>
										<TableCell data-testid={`device-spec-${spec.label}`}>{spec.value}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</SectionState>
			</CardContent>
		</Card>
	);
}
