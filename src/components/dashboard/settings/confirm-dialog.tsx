"use client";

import * as React from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useTranslation } from "react-i18next";

export interface ConfirmDialogProperties {
	open: boolean;
	title: string;
	text: string;
	confirmLabel: string;
	onCancel: () => void;
	onConfirm: () => void;
}

export function ConfirmDialog({
	open,
	title,
	text,
	confirmLabel,
	onCancel,
	onConfirm,
}: ConfirmDialogProperties): React.JSX.Element {
	const { t } = useTranslation();
	return (
		<Dialog onClose={onCancel} open={open}>
			<DialogTitle>{title}</DialogTitle>
			<DialogContent>
				<DialogContentText>{text}</DialogContentText>
			</DialogContent>
			<DialogActions>
				<Button onClick={onCancel}>{t("settings.actions.cancel")}</Button>
				<Button color="error" onClick={onConfirm} variant="contained">
					{confirmLabel}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
