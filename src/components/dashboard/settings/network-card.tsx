"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type { NetworkOverview, WifiAction, WifiNetwork } from "@/types/device";
import { postJson } from "@/lib/api";
import { usePolling, type Polled } from "@/hooks/use-polling";

import { ConfirmDialog } from "./confirm-dialog";
import { SectionState } from "./section-state";

function PasswordDialog({
	network,
	onCancel,
	onConnect,
}: {
	network: WifiNetwork | null;
	onCancel: () => void;
	onConnect: (password: string) => void;
}): React.JSX.Element {
	const [password, setPassword] = React.useState("");
	return (
		<Dialog onClose={onCancel} open={network !== null}>
			<DialogTitle>Join {network?.ssid}</DialogTitle>
			<DialogContent>
				<TextField
					autoFocus
					fullWidth
					label="Password"
					margin="dense"
					onChange={(event) => setPassword(event.target.value)}
					type="password"
					value={password}
				/>
			</DialogContent>
			<DialogActions>
				<Button onClick={onCancel}>Cancel</Button>
				<Button disabled={password.length === 0} onClick={() => onConnect(password)} variant="contained">
					Join
				</Button>
			</DialogActions>
		</Dialog>
	);
}

function NetworksTable({
	networks,
	busy,
	wifiLink,
	onAct,
	onJoin,
	onForget,
}: {
	networks: Polled<WifiNetwork[]>;
	busy: boolean;
	wifiLink: boolean;
	onAct: (action: WifiAction, done: string) => void;
	onJoin: (network: WifiNetwork) => void;
	onForget: (network: WifiNetwork) => void;
}): React.JSX.Element {
	if (!networks.data) {
		return networks.error ? (
			<Alert severity="error">{networks.error}</Alert>
		) : (
			<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
				<CircularProgress aria-label="Scanning for networks" size={16} />
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					Scanning for networks…
				</Typography>
			</Stack>
		);
	}
	return (
		<Box sx={{ overflowX: "auto" }}>
			<Table size="small">
				<TableHead>
					<TableRow>
						<TableCell>Network</TableCell>
						<TableCell>Auto-join</TableCell>
						<TableCell align="right" />
					</TableRow>
				</TableHead>
				<TableBody>
					{networks.data.map((wifi) => (
						<TableRow data-testid={`wifi-${wifi.ssid}`} key={wifi.ssid}>
							<TableCell>
								<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
									<span>{wifi.ssid}</span>
									{wifi.connected ? <Chip color="success" label="Connected" size="small" /> : null}
									{wifi.connecting ? <Chip label="Connecting…" size="small" /> : null}
									{!wifi.connected && wifi.saved ? <Chip label="Saved" size="small" variant="outlined" /> : null}
									{wifi.needsPassword ? null : <Chip label="Open" size="small" variant="outlined" />}
								</Stack>
								<Typography
									variant="caption"
									sx={{
										color: "text.secondary",
									}}
								>
									Signal {wifi.signal}%
								</Typography>
							</TableCell>
							<TableCell>
								{wifi.saved ? (
									<Switch
										checked={wifi.autoJoin}
										disabled={busy}
										onChange={(event) =>
											onAct(
												{ action: "auto-join", ssid: wifi.ssid, enabled: event.target.checked },
												`Auto-join ${event.target.checked ? "on" : "off"} for ${wifi.ssid}.`
											)
										}
										size="small"
										slotProps={{
											input: { "aria-label": `Auto-join ${wifi.ssid}` },
										}}
									/>
								) : null}
							</TableCell>
							<TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
								{wifi.connected || wifiLink ? null : (
									<Button
										disabled={busy}
										onClick={() =>
											wifi.saved || !wifi.needsPassword
												? onAct({ action: "connect", ssid: wifi.ssid }, `Joining ${wifi.ssid}.`)
												: onJoin(wifi)
										}
										size="small"
									>
										Join
									</Button>
								)}
								{wifi.saved ? (
									<Button
										color="error"
										disabled={busy || (wifiLink && wifi.connected)}
										onClick={() => onForget(wifi)}
										size="small"
									>
										Forget
									</Button>
								) : null}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</Box>
	);
}

export function NetworkCard(): React.JSX.Element {
	const polled = usePolling<NetworkOverview>("/api/settings/network", 10_000);
	const networks = usePolling<WifiNetwork[]>("/api/settings/wifi", 10_000);
	const [busy, setBusy] = React.useState(false);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);
	const [joining, setJoining] = React.useState<WifiNetwork | null>(null);
	const [forgetting, setForgetting] = React.useState<WifiNetwork | null>(null);

	const act = async (action: WifiAction, done: string): Promise<void> => {
		setBusy(true);
		setOutcome(null);
		try {
			await postJson("/api/settings/wifi", action);
			setOutcome({ severity: "success", message: done });
			await Promise.all([polled.refresh(), networks.refresh()]);
		} catch (error) {
			setOutcome({ severity: "error", message: error instanceof Error ? error.message : String(error) });
		} finally {
			setBusy(false);
		}
	};

	return (
		<Card data-testid="settings-network">
			<CardHeader subheader="Wi-Fi and wired connections of the device" title="Network" />
			<Divider />
			<CardContent>
				<SectionState label="network" polled={polled}>
					{(network) => {
						const wifiLink = network.linkInterface?.startsWith("wlan") ?? false;
						return (
							<Stack spacing={2}>
								<Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
									<FormControlLabel
										control={
											<Switch
												checked={network.wifi.enabled}
												disabled={busy || (wifiLink && network.wifi.enabled)}
												onChange={(event) =>
													void act(
														{ action: "radio", enabled: event.target.checked },
														event.target.checked ? "Wi-Fi turned on." : "Wi-Fi turned off."
													)
												}
											/>
										}
										label="Wi-Fi"
									/>
									<Typography data-testid="wifi-status" variant="body2">
										{network.wifi.connected
											? `Connected to ${network.wifi.ssid} (signal ${network.wifi.signal ?? 0}%)`
											: network.wifi.enabled
												? "Not connected"
												: "Off"}
									</Typography>
								</Stack>
								{wifiLink ? (
									<Alert severity="info">
										This app reaches the device over Wi-Fi ({network.linkInterface}), so turning Wi-Fi off, forgetting{" "}
										{network.wifi.ssid} or joining another network is disabled here. Use TiinyOS or connect the device
										by cable to make those changes.
									</Alert>
								) : null}
								{network.wifi.error ? <Alert severity="warning">{network.wifi.error}</Alert> : null}
								{outcome ? (
									<Alert onClose={() => setOutcome(null)} severity={outcome.severity}>
										{outcome.message}
									</Alert>
								) : null}
								<NetworksTable
									busy={busy}
									networks={networks}
									onAct={(action, done) => void act(action, done)}
									onForget={setForgetting}
									onJoin={setJoining}
									wifiLink={wifiLink}
								/>
								<Table size="small">
									<TableHead>
										<TableRow>
											<TableCell>Interface</TableCell>
											<TableCell>State</TableCell>
											<TableCell>Addresses</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{network.interfaces.map((entry) => (
											<TableRow data-testid={`interface-${entry.name}`} key={entry.name}>
												<TableCell>
													{entry.name}
													{entry.name === network.linkInterface ? (
														<Chip label="This app's link" size="small" sx={{ ml: 1 }} variant="outlined" />
													) : null}
												</TableCell>
												<TableCell>{entry.state}</TableCell>
												<TableCell sx={{ wordBreak: "break-all" }}>{entry.addresses.join(", ")}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</Stack>
						);
					}}
				</SectionState>
			</CardContent>
			<PasswordDialog
				key={joining?.ssid ?? ""}
				network={joining}
				onCancel={() => setJoining(null)}
				onConnect={(password) => {
					const ssid = joining?.ssid ?? "";
					setJoining(null);
					void act({ action: "connect", ssid, password }, `Joining ${ssid}.`);
				}}
			/>
			<ConfirmDialog
				confirmLabel="Forget"
				onCancel={() => setForgetting(null)}
				onConfirm={() => {
					const ssid = forgetting?.ssid ?? "";
					setForgetting(null);
					void act({ action: "forget", ssid }, `${ssid} forgotten.`);
				}}
				open={forgetting !== null}
				text={`The device will forget ${forgetting?.ssid ?? ""} and its password.`}
				title="Forget network?"
			/>
		</Card>
	);
}
