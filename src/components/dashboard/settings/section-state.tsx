"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import { useTranslation } from "react-i18next";

import type { Polled } from "@/hooks/use-polling";

// Loading spinner / error with Retry for a polled settings section; renders children once data exists.
// `loadingLabel` names the spinner, e.g. "Loading storage".
export function SectionState<T>({
	polled,
	loadingLabel,
	children,
}: {
	polled: Polled<T>;
	loadingLabel: string;
	children: (data: T) => React.ReactNode;
}): React.JSX.Element {
	const { t } = useTranslation();
	const { data, error, isLoading, refresh } = polled;
	if (isLoading) {
		return (
			<Stack sx={{ alignItems: "center", py: 4 }}>
				<CircularProgress aria-label={loadingLabel} />
			</Stack>
		);
	}
	return (
		<Stack spacing={2}>
			{error ? (
				<Alert
					action={
						<Button color="inherit" onClick={() => void refresh()} size="small">
							{t("settings.actions.retry")}
						</Button>
					}
					severity={data ? "warning" : "error"}
				>
					{data ? t("settings.section.staleValues", { error }) : error}
				</Alert>
			) : null}
			{data ? children(data) : null}
		</Stack>
	);
}
