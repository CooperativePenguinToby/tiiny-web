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

import type { ApiAccess } from "@/types/device";
import { postJson } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";

import { CopyButton } from "./copy-button";
import { SectionState } from "./section-state";

export function ApiAccessCard(): React.JSX.Element {
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
			<CardHeader subheader="Use the device's models from other apps on your network" title="API access" />
			<Divider />
			<CardContent>
				<SectionState label="API access" polled={polled}>
					{(access) => (
						<Stack spacing={2}>
							<Table size="small">
								<TableBody>
									{(
										[
											["OpenAI-compatible", access.openai, "Text, embeddings, rerank, images, speech"],
											["Anthropic", access.anthropic, "Text generation"],
											["Ollama", access.ollama, "Text generation, embeddings"],
										] as const
									).map(([format, url, use]) => (
										<TableRow key={format}>
											<TableCell component="th">{format}</TableCell>
											<TableCell>
												<code data-testid={`api-base-${format}`}>{url}</code>
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
											<TableCell align="right">
												<CopyButton label={`Copy ${format} base URL`} text={url} />
											</TableCell>
										</TableRow>
									))}
									<TableRow>
										<TableCell component="th">API key</TableCell>
										<TableCell>
											<code data-testid="api-key">{key ?? "••••••••••••••••"}</code>
										</TableCell>
										<TableCell align="right">
											{key ? (
												<CopyButton label="Copy API key" text={key} />
											) : (
												<Button onClick={() => void reveal()} size="small">
													Reveal
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
								Use a model id from the Models page, or <code>default</code> for the model most recently used. Keep the
								key private: anyone with it can use the device&apos;s API.
							</Typography>
						</Stack>
					)}
				</SectionState>
			</CardContent>
		</Card>
	);
}
