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

import type { RunningModel } from "@/types/device";

export function RunningModels({ models }: { models: RunningModel[] }): React.JSX.Element {
	return (
		<Card>
			<CardHeader title="Loaded models" />
			<Divider />
			{models.length === 0 ? (
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
						p: 3,
					}}
				>
					No models are loaded. Load one from the Models page.
				</Typography>
			) : (
				<Table aria-label="Loaded models">
					<TableHead>
						<TableRow>
							<TableCell>Model</TableCell>
							<TableCell>Type</TableCell>
							<TableCell>Status</TableCell>
							<TableCell align="right">NPU share</TableCell>
							<TableCell align="right">Active requests</TableCell>
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
								<TableCell align="right">{model.npuUsage}%</TableCell>
								<TableCell align="right">{model.activeRequests}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</Card>
	);
}
