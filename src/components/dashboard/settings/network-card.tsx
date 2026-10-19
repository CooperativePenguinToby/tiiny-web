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
import { useTranslation } from "react-i18next";

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
	const { t } = useTranslation();
	const [password, setPassword] = React.useState("");
	return (
		<Dialog onClose={onCancel} open={network !== null}>
			<DialogTitle>{t("settings.network.joinDialog.title", { ssid: network?.ssid ?? "" })}</DialogTitle>
			<DialogContent>
				<Alert severity="warning" sx={{ mb: 1 }}>
					{t("settings.network.joinWarning", { ssid: network?.ssid ?? "" })}
				</Alert>
				<TextField
					autoFocus
					fullWidth
					label={t("settings.network.joinDialog.password")}
					margin="dense"
					onChange={(event) => setPassword(event.target.value)}
					type="password"
					value={password}
				/>
			</DialogContent>
			<DialogActions>
				<Button onClick={onCancel}>{t("settings.actions.cancel")}</Button>
				<Button disabled={password.length === 0} onClick={() => onConnect(password)} variant="contained">
					{t("settings.network.networks.join")}
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
	onConfirmJoin,
	onForget,
}: {
	networks: Polled<WifiNetwork[]>;
	busy: boolean;
	wifiLink: boolean;
	onAct: (action: WifiAction, done: string) => void;
	onJoin: (network: WifiNetwork) => void;
	onConfirmJoin: (network: WifiNetwork) => void;
	onForget: (network: WifiNetwork) => void;
}): React.JSX.Element {
	const { t } = useTranslation();
	if (!networks.data) {
		return networks.error ? (
			<Alert severity="error">{networks.error}</Alert>
		) : (
			<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
				<CircularProgress aria-label={t("settings.network.networks.scanning")} size={16} />
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					{t("settings.network.networks.scanning")}
				</Typography>
			</Stack>
		);
	}
	return (
		<Box sx={{ overflowX: "auto" }}>
			<Table size="small">
				<TableHead>
					<TableRow>
						<TableCell>{t("settings.network.networks.network")}</TableCell>
						<TableCell>{t("settings.network.networks.autoJoin")}</TableCell>
						<TableCell align="right" />
					</TableRow>
				</TableHead>
				<TableBody>
					{networks.data.map((wifi) => (
						<TableRow data-testid={`wifi-${wifi.ssid}`} key={wifi.ssid}>
							<TableCell>
								<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
									<span>{wifi.ssid}</span>
									{wifi.connected ? (
										<Chip color="success" label={t("settings.network.networks.connected")} size="small" />
									) : null}
									{wifi.connecting ? <Chip label={t("settings.network.networks.connecting")} size="small" /> : null}
									{!wifi.connected && wifi.saved ? (
										<Chip label={t("settings.network.networks.saved")} size="small" variant="outlined" />
									) : null}
									{wifi.needsPassword ? null : (
										<Chip label={t("settings.network.networks.open")} size="small" variant="outlined" />
									)}
								</Stack>
								<Typography
									variant="caption"
									sx={{
										color: "text.secondary",
									}}
								>
									{t("settings.network.networks.signal", { signal: wifi.signal })}
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
												t(
													event.target.checked
														? "settings.network.networks.autoJoinOn"
														: "settings.network.networks.autoJoinOff",
													{ ssid: wifi.ssid }
												)
											)
										}
										size="small"
										slotProps={{
											input: { "aria-label": t("settings.network.networks.autoJoinSwitch", { ssid: wifi.ssid }) },
										}}
									/>
								) : null}
							</TableCell>
							<TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
								{wifi.connected ? null : (
									<Button
										disabled={busy}
										onClick={() => (wifi.saved || !wifi.needsPassword ? onConfirmJoin(wifi) : onJoin(wifi))}
										size="small"
									>
										{t("settings.network.networks.join")}
									</Button>
								)}
								{wifi.saved ? (
									<Button
										color="error"
										disabled={busy || (wifiLink && wifi.connected)}
										onClick={() => onForget(wifi)}
										size="small"
									>
										{t("settings.network.networks.forget")}
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
	const { t } = useTranslation();
	const polled = usePolling<NetworkOverview>("/api/settings/network", 10_000);
	const networks = usePolling<WifiNetwork[]>("/api/settings/wifi", 10_000);
	const [busy, setBusy] = React.useState(false);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);
	const [joining, setJoining] = React.useState<WifiNetwork | null>(null);
	const [confirmingJoin, setConfirmingJoin] = React.useState<WifiNetwork | null>(null);
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
			<CardHeader subheader={t("settings.network.subheader")} title={t("settings.network.title")} />
			<Divider />
			<CardContent>
				<SectionState loadingLabel={t("settings.network.loading")} polled={polled}>
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
														t(event.target.checked ? "settings.network.wifiTurnedOn" : "settings.network.wifiTurnedOff")
													)
												}
											/>
										}
										label={t("settings.network.wifi")}
									/>
									<Typography data-testid="wifi-status" variant="body2">
										{network.wifi.connected
											? t("settings.network.connectedTo", { ssid: network.wifi.ssid, signal: network.wifi.signal ?? 0 })
											: t(network.wifi.enabled ? "settings.network.notConnected" : "settings.network.off")}
									</Typography>
								</Stack>
								{wifiLink ? (
									<Alert severity="info">
										{t("settings.network.wifiLink", { interface: network.linkInterface, ssid: network.wifi.ssid })}
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
									onConfirmJoin={setConfirmingJoin}
									onForget={setForgetting}
									onJoin={setJoining}
									wifiLink={wifiLink}
								/>
								<Table size="small">
									<TableHead>
										<TableRow>
											<TableCell>{t("settings.network.interfaces.interface")}</TableCell>
											<TableCell>{t("settings.network.interfaces.state")}</TableCell>
											<TableCell>{t("settings.network.interfaces.addresses")}</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{network.interfaces.map((entry) => (
											<TableRow data-testid={`interface-${entry.name}`} key={entry.name}>
												<TableCell>
													{entry.name}
													{entry.name === network.linkInterface ? (
														<Chip
															label={t("settings.network.interfaces.appLink")}
															size="small"
															sx={{ ml: 1 }}
															variant="outlined"
														/>
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
					void act({ action: "connect", ssid, password }, t("settings.network.networks.joining", { ssid }));
				}}
			/>
			<ConfirmDialog
				confirmLabel={t("settings.network.networks.join")}
				onCancel={() => setConfirmingJoin(null)}
				onConfirm={() => {
					const ssid = confirmingJoin?.ssid ?? "";
					setConfirmingJoin(null);
					void act({ action: "connect", ssid }, t("settings.network.networks.joining", { ssid }));
				}}
				open={confirmingJoin !== null}
				text={t("settings.network.joinWarning", { ssid: confirmingJoin?.ssid ?? "" })}
				title={t("settings.network.joinDialog.title", { ssid: confirmingJoin?.ssid ?? "" })}
			/>
			<ConfirmDialog
				confirmLabel={t("settings.network.networks.forget")}
				onCancel={() => setForgetting(null)}
				onConfirm={() => {
					const ssid = forgetting?.ssid ?? "";
					setForgetting(null);
					void act({ action: "forget", ssid }, t("settings.network.networks.forgotten", { ssid }));
				}}
				open={forgetting !== null}
				text={t("settings.network.forgetDialog.text", { ssid: forgetting?.ssid ?? "" })}
				title={t("settings.network.forgetDialog.title")}
			/>
		</Card>
	);
}
