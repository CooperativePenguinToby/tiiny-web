"use client";

import * as React from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import type { StoreModel } from "@/types/device";

function reasoning(thinking: StoreModel["details"]["thinking"]): string {
	if (!thinking.supported) return "None";
	const mode = thinking.toggleable ? "Can be turned off" : "Always on";
	const levels = thinking.levels.length > 0 ? `; levels ${thinking.levels.join(", ")}` : "";
	const fallback = thinking.defaultLevel ? ` (default ${thinking.defaultLevel})` : "";
	return `${mode}${levels}${fallback}`;
}

export function ModelDetailsDialog({
	model,
	onClose,
}: {
	model: StoreModel | null;
	onClose: () => void;
}): React.JSX.Element {
	const details = model?.details;
	const rows: [string, string][] =
		model && details
			? [
					["Model id", model.modelId],
					["Type", model.type],
					["Parameters", model.params || "—"],
					["Input → output", `${details.input || "—"} → ${details.output || "—"}`],
					["NPU share", `${model.npuUsage}%`],
					...(details.contextWindow
						? [["Context window", `${details.contextWindow.toLocaleString()} tokens`] as [string, string]]
						: []),
					...(details.image
						? ([
								["Image size", details.image.size],
								["Default steps", details.image.steps === null ? "—" : String(details.image.steps)],
								["Guidance scale", details.image.guidanceScale ?? "—"],
							] as [string, string][])
						: []),
					["Reasoning", reasoning(details.thinking)],
					...(details.loadSeconds ? [["Load time", `about ${details.loadSeconds} s`] as [string, string]] : []),
					["Downloads · likes", `${model.downloads.toLocaleString()} · ${model.likes.toLocaleString()}`],
				]
			: [];
	return (
		<Dialog fullWidth maxWidth="sm" onClose={onClose} open={model !== null}>
			<DialogTitle>{model?.name}</DialogTitle>
			<DialogContent>
				<Typography color="text.secondary" sx={{ mb: 2 }} variant="body2">
					{model?.description}
				</Typography>
				<Table aria-label="Model details" size="small">
					<TableBody>
						{rows.map(([label, value]) => (
							<TableRow data-testid={`detail-${label}`} key={label}>
								<TableCell component="th">{label}</TableCell>
								<TableCell>{value}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Close</Button>
			</DialogActions>
		</Dialog>
	);
}
