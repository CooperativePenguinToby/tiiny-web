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
import Typography from "@mui/material/Typography";
import { Trans, useTranslation } from "react-i18next";

import type { ApiAccess } from "@/types/device";
import { postJson } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";

import { CopyButton } from "./copy-button";
import { SectionState } from "./section-state";

export function ApiAccessCard(): React.JSX.Element {
	const { t } = useTranslation();
	const polled = usePolling<ApiAccess>("/api/settings/api-access", 300_000);
	const [key, setKey] = React.useState<string | null>(null);
	const [error, setError] = React.useState<string | null>(null);

	const reveal = async (): Promise<void> => {
		setError(null);
		try {
			const reply = await postJson<{ key: string }>("/api/settings/api-access");
			setKey(reply.key);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : String(error_));
		}
	};

	return (
		<Card data-testid="settings-api">
			<CardHeader subheader={t("settings.apiAccess.subheader")} title={t("settings.apiAccess.title")} />
			<Divider />
			<CardContent>
				<SectionState loadingLabel={t("settings.apiAccess.loading")} polled={polled}>
					{(access) => (
						<Stack spacing={2}>
							<Table size="small">
								<TableBody>
									{(
										[
											// The id names the format in test ids; the label is what is shown.
											[
												"OpenAI-compatible",
												t("settings.apiAccess.openaiCompatible"),
												access.openai,
												t("settings.apiAccess.uses.openai"),
											],
											["Anthropic", "Anthropic", access.anthropic, t("settings.apiAccess.uses.anthropic")],
											["Ollama", "Ollama", access.ollama, t("settings.apiAccess.uses.ollama")],
										] as const
									).map(([format, label, urls, use]) => (
										<TableRow key={format}>
											<TableCell component="th">{label}</TableCell>
											<TableCell colSpan={2}>
												<Stack spacing={0.5}>
													{urls.map((url) => (
														<Stack
															direction="row"
															key={url}
															spacing={1}
															sx={{ alignItems: "center", justifyContent: "space-between" }}
														>
															<code data-testid={`api-base-${format}`} style={{ wordBreak: "break-all" }}>
																{url}
															</code>
															<CopyButton label={t("settings.apiAccess.copyBaseUrl", { format: label })} text={url} />
														</Stack>
													))}
												</Stack>
												<Typography
													component="div"
													variant="caption"
													sx={{
														color: "text.secondary",
													}}
												>
													{use}
												</Typography>
											</TableCell>
										</TableRow>
									))}
									<TableRow>
										<TableCell component="th">{t("settings.apiAccess.apiKey")}</TableCell>
										<TableCell>
											<code data-testid="api-key">{key ?? "••••••••••••••••"}</code>
										</TableCell>
										<TableCell align="right">
											{key ? (
												<CopyButton label={t("settings.apiAccess.copyApiKey")} text={key} />
											) : (
												<Button onClick={() => void reveal()} size="small">
													{t("settings.apiAccess.reveal")}
												</Button>
											)}
										</TableCell>
									</TableRow>
								</TableBody>
							</Table>
							{error ? <Alert severity="error">{error}</Alert> : null}
							<Typography
								variant="body2"
								sx={{
									color: "text.secondary",
								}}
							>
								<Trans components={{ code: <code /> }} i18nKey="settings.apiAccess.hint" />
							</Typography>
						</Stack>
					)}
				</SectionState>
			</CardContent>
		</Card>
	);
}
