"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { Connector } from "@/types/device";
import { postJson } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import { ConfirmDialog } from "@/components/dashboard/settings/confirm-dialog";

import { ConnectDialog } from "./connect-dialog";
import { McpServers } from "./mcp-servers";

const OAUTH = new Set<Connector["key"]>(["gmail", "google-calendar", "outlook-mail", "outlook-calendar"]);
const CATEGORY = { email: "Email", calendar: "Calendar", messaging: "Messaging" } as const;
const CARD_SX = { height: "100%", display: "flex", flexDirection: "column" } as const;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function ConnectorsPanel(): React.JSX.Element {
	const polled = usePolling<Connector[]>("/api/connectors", 5000);
	const [connecting, setConnecting] = React.useState<Connector | null>(null);
	const [signIn, setSignIn] = React.useState<{ key: Connector["key"]; url: string } | null>(null);
	const [disconnecting, setDisconnecting] = React.useState<Connector | null>(null);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);

	// Account sign-in happens on the provider's page; the device reports the connection when it completes.
	const startSignIn = async (connector: Connector): Promise<void> => {
		setOutcome(null);
		try {
			const { url } = await postJson<{ url: string }>("/api/connectors/connect", { key: connector.key });
			setSignIn({ key: connector.key, url });
			globalThis.open(url, "_blank", "noopener");
		} catch (error) {
			setOutcome({ severity: "error", message: `${connector.name}: ${errorMessage(error)}` });
		}
	};

	React.useEffect(() => {
		if (!signIn) return;
		const connector = polled.data?.find((entry) => entry.key === signIn.key);
		if (connector?.connected) {
			setSignIn(null);
			setOutcome({ severity: "success", message: `${connector.name} connected: ${connector.detail}.` });
		}
	}, [polled.data, signIn]);

	// WhatsApp connects when the QR code is scanned on the phone.
	React.useEffect(() => {
		if (connecting?.key !== "whatsapp") return;
		if (polled.data?.find((entry) => entry.key === "whatsapp")?.connected) {
			setConnecting(null);
			setOutcome({ severity: "success", message: "WhatsApp connected." });
		}
	}, [polled.data, connecting]);

	const disconnect = async (connector: Connector): Promise<void> => {
		setDisconnecting(null);
		try {
			await postJson("/api/connectors/disconnect", { key: connector.key });
			setOutcome({ severity: "success", message: `${connector.name} disconnected.` });
			await polled.refresh();
		} catch (error) {
			setOutcome({ severity: "error", message: `${connector.name}: ${errorMessage(error)}` });
		}
	};

	return (
		<Stack spacing={4}>
			{outcome ? (
				<Alert onClose={() => setOutcome(null)} severity={outcome.severity}>
					{outcome.message}
				</Alert>
			) : null}
			{polled.error ? <Alert severity={polled.data ? "warning" : "error"}>{polled.error}</Alert> : null}
			<Stack spacing={2}>
				<Typography variant="h6">Services</Typography>
				<Typography color="text.secondary" variant="body2">
					Models use connected services in Task mode, within what you authorize. Connections live on the device and are
					shared with TiinyOS.
				</Typography>
				{polled.data === null ? (
					polled.isLoading ? (
						<CircularProgress aria-label="Loading connectors" />
					) : null
				) : (
					<Grid container spacing={3}>
						{polled.data.map((connector) => {
							const waiting = signIn?.key === connector.key;
							return (
								<Grid key={connector.key} size={{ lg: 4, md: 6, xs: 12 }}>
									<Card data-testid={`connector-${connector.key}`} sx={CARD_SX}>
										<CardContent sx={{ flexGrow: 1 }}>
											<Stack spacing={1}>
												<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
													<Typography variant="subtitle1">{connector.name}</Typography>
													<Chip
														data-testid="connector-state"
														color={connector.connected ? "success" : "default"}
														label={connector.connected ? "Connected" : "Not connected"}
														size="small"
													/>
												</Stack>
												<Typography color="text.secondary" variant="caption">
													{CATEGORY[connector.category]}
												</Typography>
												<Typography color="text.secondary" data-testid="connector-detail" variant="body2">
													{connector.detail}
												</Typography>
												{waiting ? (
													<Typography role="status" variant="body2">
														Waiting for you to finish signing in…{" "}
														<Link href={signIn.url} rel="noreferrer" target="_blank">
															Open the sign-in page
														</Link>
													</Typography>
												) : null}
											</Stack>
										</CardContent>
										<CardActions sx={{ px: 2, pb: 2, pt: 0, gap: 1 }}>
											{connector.connected ? (
												<Button color="error" onClick={() => setDisconnecting(connector)}>
													Disconnect
												</Button>
											) : (
												<Button
													onClick={() =>
														OAUTH.has(connector.key) ? void startSignIn(connector) : setConnecting(connector)
													}
													variant="contained"
												>
													Connect
												</Button>
											)}
											{waiting ? <Button onClick={() => setSignIn(null)}>Cancel</Button> : null}
										</CardActions>
									</Card>
								</Grid>
							);
						})}
					</Grid>
				)}
			</Stack>
			<McpServers />
			<ConnectDialog
				connector={connecting}
				key={connecting?.key ?? ""}
				onClose={() => {
					setConnecting(null);
					void polled.refresh();
				}}
				onConnected={(message) => {
					setConnecting(null);
					setOutcome({ severity: "success", message });
					void polled.refresh();
				}}
			/>
			<ConfirmDialog
				confirmLabel="Disconnect"
				onCancel={() => setDisconnecting(null)}
				onConfirm={() => disconnecting && void disconnect(disconnecting)}
				open={disconnecting !== null}
				text={`Disconnect ${disconnecting?.name ?? ""}? The device forgets the stored sign-in, and models can no longer use it.`}
				title="Disconnect?"
			/>
		</Stack>
	);
}
