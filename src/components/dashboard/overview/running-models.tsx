import * as React from "react";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { RunningModel } from "@/types/device";
import { useFormat } from "@/i18n/client";

export function RunningModels({ models }: { models: RunningModel[] }): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	return (
		<Card>
			<CardHeader title={t("overview.running.title")} />
			<Divider />
			{models.length === 0 ? (
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
						p: 3,
					}}
				>
					{t("overview.running.empty")}
				</Typography>
			) : (
				<Table aria-label={t("overview.running.title")}>
					<TableHead>
						<TableRow>
							<TableCell>{t("overview.running.columns.model")}</TableCell>
							<TableCell>{t("overview.running.columns.type")}</TableCell>
							<TableCell>{t("overview.running.columns.status")}</TableCell>
							<TableCell align="right">{t("overview.running.columns.npuShare")}</TableCell>
							<TableCell align="right">{t("overview.running.columns.activeRequests")}</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{models.map((model) => (
							<TableRow hover key={model.modelId} data-testid={`running-${model.modelId}`}>
								<TableCell>
									<Typography variant="subtitle2">{model.name}</Typography>
									<Typography
										variant="body2"
										sx={{
											color: "text.secondary",
										}}
									>
										{model.modelId}
									</Typography>
								</TableCell>
								<TableCell>{model.type}</TableCell>
								<TableCell>
									<Chip color={model.status === "running" ? "success" : "warning"} label={model.status} size="small" />
								</TableCell>
								<TableCell align="right">{t("overview.percent", { value: format.number(model.npuUsage) })}</TableCell>
								<TableCell align="right">{format.number(model.activeRequests)}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</Card>
	);
}
