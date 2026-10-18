"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";

import type { Polled } from "@/hooks/use-polling";

// Loading spinner / error with Retry for a polled settings section; renders children once data exists.
export function SectionState<T>({
	polled,
	label,
	children,
}: {
	polled: Polled<T>;
	label: string;
	children: (data: T) => React.ReactNode;
}): React.JSX.Element {
	const { data, error, isLoading, refresh } = polled;
	if (isLoading) {
		return (
			<Stack sx={{ alignItems: "center", py: 4 }}>
				<CircularProgress aria-label={`Loading ${label}`} />
			</Stack>
		);
	}
	return (
		<Stack spacing={2}>
			{error ? (
				<Alert
					action={
						<Button color="inherit" onClick={() => void refresh()} size="small">
							Retry
						</Button>
					}
					severity={data ? "warning" : "error"}
				>
					{data ? `Showing last known values. ${error}` : error}
				</Alert>
			) : null}
			{data ? children(data) : null}
		</Stack>
	);
}
