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
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type { StoreModel } from "@/types/device";
import { useFormat } from "@/i18n/client";

function reasoning(thinking: StoreModel["details"]["thinking"], t: TFunction): string {
	if (!thinking.supported) return t("models.store.details.thinking.none");
	const mode = t(
		thinking.toggleable ? "models.store.details.thinking.toggleable" : "models.store.details.thinking.alwaysOn"
	);
	const levels =
		thinking.levels.length > 0
			? `; ${t("models.store.details.thinking.levels", { levels: thinking.levels.join(", ") })}`
			: "";
	const fallback = thinking.defaultLevel
		? ` (${t("models.store.details.thinking.defaultLevel", { level: thinking.defaultLevel })})`
		: "";
	return `${mode}${levels}${fallback}`;
}

// A detail row: a stable test id (the English label), the shown label and the value.
type Row = [id: string, label: string, value: string];

export function ModelDetailsDialog({
	model,
	onClose,
}: {
	model: StoreModel | null;
	onClose: () => void;
}): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	const details = model?.details;
	const rows: Row[] =
		model && details
			? [
					["Model id", t("models.store.details.modelId"), model.modelId],
					["Type", t("models.store.details.type"), model.type],
					["Parameters", t("models.store.details.parameters"), model.params || "—"],
					[
						"Input → output",
						t("models.store.details.inputOutput"),
						`${details.input || "—"} → ${details.output || "—"}`,
					],
					[
						"NPU share",
						t("models.store.details.npuShare"),
						t("models.percent", { value: format.number(model.npuUsage) }),
					],
					...(details.contextWindow
						? [
								[
									"Context window",
									t("models.store.details.contextWindow"),
									t("models.store.details.tokens", {
										count: details.contextWindow,
										tokens: format.number(details.contextWindow),
									}),
								] as Row,
							]
						: []),
					...(details.image
						? ([
								["Image size", t("models.store.details.imageSize"), details.image.size],
								[
									"Default steps",
									t("models.store.details.defaultSteps"),
									details.image.steps === null ? "—" : format.number(details.image.steps),
								],
								["Guidance scale", t("models.store.details.guidanceScale"), details.image.guidanceScale ?? "—"],
							] as Row[])
						: []),
					["Reasoning", t("models.store.details.reasoning"), reasoning(details.thinking, t)],
					...(details.loadSeconds
						? [
								[
									"Load time",
									t("models.store.details.loadTime"),
									t("models.store.details.loadSeconds", { seconds: format.number(details.loadSeconds) }),
								] as Row,
							]
						: []),
					[
						"Downloads · likes",
						t("models.store.details.downloadsLikes"),
						`${format.number(model.downloads)} · ${format.number(model.likes)}`,
					],
				]
			: [];
	return (
		<Dialog fullWidth maxWidth="sm" onClose={onClose} open={model !== null}>
			<DialogTitle>{model?.name}</DialogTitle>
			<DialogContent>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
						mb: 2,
					}}
				>
					{model?.description}
				</Typography>
				<Table aria-label={t("models.store.details.tableLabel")} size="small">
					<TableBody>
						{rows.map(([id, label, value]) => (
							<TableRow data-testid={`detail-${id}`} key={id}>
								<TableCell component="th">{label}</TableCell>
								<TableCell>{value}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>{t("models.store.details.close")}</Button>
			</DialogActions>
		</Dialog>
	);
}
