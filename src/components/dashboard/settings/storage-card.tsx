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

import type { StorageOverview } from "@/types/device";
import { postJson } from "@/lib/api";
import { formatBytes, percent } from "@/lib/format";
import { usePolling } from "@/hooks/use-polling";

import { ConfirmDialog } from "./confirm-dialog";
import { SectionState } from "./section-state";

type Target = { kind: "model"; id: string } | { kind: "agent"; id: string };

export function StorageCard(): React.JSX.Element {
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
			setOutcome({ severity: "success", message: `${target.id} deleted.` });
			await polled.refresh();
		} catch (error) {
			setOutcome({ severity: "error", message: error instanceof Error ? error.message : String(error) });
		} finally {
			setBusy(null);
		}
	};

	return (
		<Card data-testid="settings-storage">
			<CardHeader subheader="Disk usage on the device" title="Storage" />
			<Divider />
			<CardContent>
				<SectionState label="storage" polled={polled}>
					{(storage) => (
						<Stack spacing={3}>
							<Stack spacing={1}>
								<Typography data-testid="storage-used" variant="body2">
									{formatBytes(storage.usedBytes)} of {formatBytes(storage.totalBytes)} used
								</Typography>
								<LinearProgress
									aria-label="Storage used"
									value={percent(storage.usedBytes, storage.totalBytes)}
									variant="determinate"
								/>
								<Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
									{storage.categories.map((category) => (
										<Chip
											data-testid={`storage-category-${category.name}`}
											key={category.name}
											label={`${category.name}: ${formatBytes(category.sizeBytes)}`}
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
										<TableCell>Model files</TableCell>
										<TableCell align="right">Size</TableCell>
										<TableCell align="right" />
									</TableRow>
								</TableHead>
								<TableBody>
									{storage.models.map((model) => (
										<TableRow data-testid={`storage-model-${model.modelId}`} key={model.modelId}>
											<TableCell>{model.modelId}</TableCell>
											<TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
												{formatBytes(model.sizeBytes)}
											</TableCell>
											<TableCell align="right">
												{model.protected ? (
													<Typography color="text.secondary" variant="caption">
														Used by Vault
													</Typography>
												) : (
													<Button
														color="error"
														disabled={busy !== null}
														onClick={() => setConfirm({ kind: "model", id: model.modelId })}
														size="small"
													>
														{busy === model.modelId ? "Deleting…" : "Delete"}
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
										<TableCell>Agent files</TableCell>
										<TableCell align="right">Size</TableCell>
										<TableCell align="right" />
									</TableRow>
								</TableHead>
								<TableBody>
									{storage.agents.map((agent) => (
										<TableRow data-testid={`storage-agent-${agent.serviceId}`} key={agent.serviceId}>
											<TableCell>{agent.serviceId}</TableCell>
											<TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
												{formatBytes(agent.sizeBytes)}
											</TableCell>
											<TableCell align="right">
												<Button
													color="error"
													disabled={busy !== null}
													onClick={() => setConfirm({ kind: "agent", id: agent.serviceId })}
													size="small"
												>
													{busy === agent.serviceId ? "Deleting…" : "Delete"}
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
				confirmLabel="Delete"
				onCancel={() => setConfirm(null)}
				onConfirm={() => confirm && void remove(confirm)}
				open={confirm !== null}
				text={
					confirm?.kind === "agent"
						? `Delete ${confirm.id} and its data from the device? This cannot be undone.`
						: `Delete ${confirm?.id ?? ""} from the device? You will have to download it again to use it.`
				}
				title={confirm?.kind === "agent" ? "Delete agent?" : "Delete model?"}
			/>
		</Card>
	);
}
