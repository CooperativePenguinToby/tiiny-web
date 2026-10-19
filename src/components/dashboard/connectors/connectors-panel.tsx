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
import type { ParseKeys } from "i18next";
import { Trans, useTranslation } from "react-i18next";

import type { Connector } from "@/types/device";
import { postJson } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import { ConfirmDialog } from "@/components/dashboard/settings/confirm-dialog";

import { ConnectDialog } from "./connect-dialog";
import { ConnectorLogo } from "./connector-logo";
import { McpServers } from "./mcp-servers";

const OAUTH = new Set<Connector["key"]>(["gmail", "google-calendar", "outlook-mail", "outlook-calendar"]);
const CATEGORY: Record<Connector["category"], ParseKeys> = {
	email: "connectors.category.email",
	calendar: "connectors.category.calendar",
	messaging: "connectors.category.messaging",
};
const CARD_SX = { height: "100%", display: "flex", flexDirection: "column" } as const;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function ConnectorsPanel(): React.JSX.Element {
	const { t } = useTranslation();
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
			open(url, "_blank", "noopener");
		} catch (error) {
			setOutcome({
				severity: "error",
				message: t("connectors.outcome.error", { name: connector.name, message: errorMessage(error) }),
			});
		}
	};

	// (Both checks adjust state while rendering, as soon as a poll shows the connection.)
	const signedIn = signIn ? polled.data?.find((entry) => entry.key === signIn.key) : undefined;
	if (signedIn?.connected) {
		setSignIn(null);
		setOutcome({
			severity: "success",
			message: t("connectors.outcome.connected", { name: signedIn.name, detail: signedIn.detail }),
		});
	}

	// WhatsApp connects when the QR code is scanned on the phone.
	if (connecting?.key === "whatsapp" && polled.data?.find((entry) => entry.key === "whatsapp")?.connected) {
		setConnecting(null);
		setOutcome({ severity: "success", message: t("connectors.outcome.whatsappConnected") });
	}

	const disconnect = async (connector: Connector): Promise<void> => {
		setDisconnecting(null);
		try {
			await postJson("/api/connectors/disconnect", { key: connector.key });
			setOutcome({ severity: "success", message: t("connectors.outcome.disconnected", { name: connector.name }) });
			await polled.refresh();
		} catch (error) {
			setOutcome({
				severity: "error",
				message: t("connectors.outcome.error", { name: connector.name, message: errorMessage(error) }),
			});
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
				<Typography variant="h6">{t("connectors.services.heading")}</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					{t("connectors.services.description")}
				</Typography>
				{polled.data === null ? (
					polled.isLoading ? (
						<CircularProgress aria-label={t("connectors.services.loading")} />
					) : null
				) : (
					<Grid container spacing={3}>
						{polled.data.map((connector) => {
							const isWaiting = signIn?.key === connector.key;
							return (
								<Grid key={connector.key} size={{ lg: 4, md: 6, xs: 12 }}>
									<Card data-testid={`connector-${connector.key}`} sx={CARD_SX}>
										<CardContent sx={{ flexGrow: 1 }}>
											<Stack spacing={1}>
												<Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
													<ConnectorLogo connectorKey={connector.key} />
													<div>
														<Stack
															direction="row"
															spacing={1}
															useFlexGap
															sx={{ alignItems: "center", flexWrap: "wrap" }}
														>
															<Typography variant="subtitle1" sx={{ whiteSpace: "nowrap" }}>
																{connector.name}
															</Typography>
															<Chip
																data-testid="connector-state"
																color={connector.connected ? "success" : "default"}
																label={t(
																	connector.connected ? "connectors.state.connected" : "connectors.state.notConnected"
																)}
																size="small"
															/>
														</Stack>
														<Typography
															variant="caption"
															sx={{
																color: "text.secondary",
															}}
														>
															{t(CATEGORY[connector.category])}
														</Typography>
													</div>
												</Stack>
												<Typography
													data-testid="connector-detail"
													variant="body2"
													sx={{
														color: "text.secondary",
													}}
												>
													{connector.detail}
												</Typography>
												{isWaiting ? (
													<Typography role="status" variant="body2">
														<Trans
															components={{ link: <Link href={signIn.url} rel="noreferrer" target="_blank" /> }}
															i18nKey="connectors.services.waitingForSignIn"
														/>
													</Typography>
												) : null}
											</Stack>
										</CardContent>
										<CardActions sx={{ px: 2, pb: 2, pt: 0, gap: 1 }}>
											{connector.connected ? (
												<Button color="error" onClick={() => setDisconnecting(connector)}>
													{t("connectors.actions.disconnect")}
												</Button>
											) : (
												<Button
													onClick={() =>
														OAUTH.has(connector.key) ? void startSignIn(connector) : setConnecting(connector)
													}
													variant="contained"
												>
													{t("connectors.actions.connect")}
												</Button>
											)}
											{isWaiting ? (
												<Button onClick={() => setSignIn(null)}>{t("connectors.actions.cancel")}</Button>
											) : null}
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
				confirmLabel={t("connectors.actions.disconnect")}
				onCancel={() => setDisconnecting(null)}
				onConfirm={() => disconnecting && void disconnect(disconnecting)}
				open={disconnecting !== null}
				text={t("connectors.disconnectDialog.text", { name: disconnecting?.name ?? "" })}
				title={t("connectors.disconnectDialog.title")}
			/>
		</Stack>
	);
}
