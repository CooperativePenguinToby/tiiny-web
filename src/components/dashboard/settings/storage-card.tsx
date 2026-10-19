"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { StorageOverview } from "@/types/device";
import { postJson } from "@/lib/api";
import { percent } from "@/lib/format";
import { useFormat } from "@/i18n/client";
import { usePolling } from "@/hooks/use-polling";

import { ConfirmDialog } from "./confirm-dialog";
import { SectionState } from "./section-state";

type Target = { kind: "model"; id: string } | { kind: "agent"; id: string };

export function StorageCard(): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	const polled = usePolling<StorageOverview>("/api/settings/storage", 30_000);
	const [confirm, setConfirm] = React.useState<Target | null>(null);
	const [busy, setBusy] = React.useState<string | null>(null);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);

	const remove = async (target: Target): Promise<void> => {
		setConfirm(null);
		setBusy(target.id);
		setOutcome(null);
		try {
			await (target.kind === "model"
				? postJson("/api/models/delete", { modelId: target.id })
				: postJson("/api/agents/delete", { serviceId: target.id }));
			setOutcome({ severity: "success", message: t("settings.storage.deleted", { id: target.id }) });
			await polled.refresh();
		} catch (error) {
			setOutcome({ severity: "error", message: error instanceof Error ? error.message : String(error) });
		} finally {
			setBusy(null);
		}
	};

	return (
		<Card data-testid="settings-storage">
			<CardHeader subheader={t("settings.storage.subheader")} title={t("settings.storage.title")} />
			<Divider />
			<CardContent>
				<SectionState loadingLabel={t("settings.storage.loading")} polled={polled}>
					{(storage) => (
						<Stack spacing={3}>
							<Stack spacing={1}>
								<Typography data-testid="storage-used" variant="body2">
									{t("settings.storage.used", {
										used: format.bytes(storage.usedBytes),
										total: format.bytes(storage.totalBytes),
									})}
								</Typography>
								<LinearProgress
									aria-label={t("settings.storage.usedBar")}
									value={percent(storage.usedBytes, storage.totalBytes)}
									variant="determinate"
								/>
								<Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
									{storage.categories.map((category) => (
										<Chip
											data-testid={`storage-category-${category.name}`}
											key={category.name}
											label={t("settings.storage.category", {
												name: category.name,
												size: format.bytes(category.sizeBytes),
											})}
											variant="outlined"
										/>
									))}
								</Stack>
							</Stack>
							{outcome ? (
								<Alert onClose={() => setOutcome(null)} severity={outcome.severity}>
									{outcome.message}
								</Alert>
							) : null}
							<Table size="small">
								<TableHead>
									<TableRow>
										<TableCell>{t("settings.storage.modelFiles")}</TableCell>
										<TableCell align="right">{t("settings.storage.size")}</TableCell>
										<TableCell align="right" />
									</TableRow>
								</TableHead>
								<TableBody>
									{storage.models.map((model) => (
										<TableRow data-testid={`storage-model-${model.modelId}`} key={model.modelId}>
											<TableCell>{model.modelId}</TableCell>
											<TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
												{format.bytes(model.sizeBytes)}
											</TableCell>
											<TableCell align="right">
												{model.protected ? (
													<Typography
														variant="caption"
														sx={{
															color: "text.secondary",
														}}
													>
														{t("settings.storage.usedByVault")}
													</Typography>
												) : (
													<Button
														color="error"
														disabled={busy !== null}
														onClick={() => setConfirm({ kind: "model", id: model.modelId })}
														size="small"
													>
														{t(busy === model.modelId ? "settings.actions.deleting" : "settings.actions.delete")}
													</Button>
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
							<Table size="small">
								<TableHead>
									<TableRow>
										<TableCell>{t("settings.storage.agentFiles")}</TableCell>
										<TableCell align="right">{t("settings.storage.size")}</TableCell>
										<TableCell align="right" />
									</TableRow>
								</TableHead>
								<TableBody>
									{storage.agents.map((agent) => (
										<TableRow data-testid={`storage-agent-${agent.serviceId}`} key={agent.serviceId}>
											<TableCell>{agent.serviceId}</TableCell>
											<TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
												{format.bytes(agent.sizeBytes)}
											</TableCell>
											<TableCell align="right">
												<Button
													color="error"
													disabled={busy !== null}
													onClick={() => setConfirm({ kind: "agent", id: agent.serviceId })}
													size="small"
												>
													{t(busy === agent.serviceId ? "settings.actions.deleting" : "settings.actions.delete")}
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</Stack>
					)}
				</SectionState>
			</CardContent>
			<ConfirmDialog
				confirmLabel={t("settings.actions.delete")}
				onCancel={() => setConfirm(null)}
				onConfirm={() => confirm && void remove(confirm)}
				open={confirm !== null}
				text={
					confirm?.kind === "agent"
						? t("settings.storage.deleteAgentText", { id: confirm.id })
						: t("settings.storage.deleteModelText", { id: confirm?.id ?? "" })
				}
				title={t(confirm?.kind === "agent" ? "settings.storage.deleteAgentTitle" : "settings.storage.deleteModelTitle")}
			/>
		</Card>
	);
}
