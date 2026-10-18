"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr/WarningCircle";

import type { TaskStep } from "@/types/device";

function Step({ step }: { step: TaskStep }): React.JSX.Element {
	const [open, setOpen] = React.useState(false);
	const done = step.ok !== undefined;
	return (
		<Box data-testid="task-step">
			<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
				{done ? (
					step.ok ? (
						<CheckCircleIcon color="var(--mui-palette-success-main)" fontSize="var(--icon-fontSize-md)" />
					) : (
						<WarningCircleIcon color="var(--mui-palette-error-main)" fontSize="var(--icon-fontSize-md)" />
					)
				) : (
					<CircularProgress aria-label={`${step.label} running`} size={14} />
				)}
				<Typography variant="body2">{step.label}</Typography>
				{done && step.result ? (
					<Link component="button" onClick={() => setOpen(!open)} type="button" variant="caption">
						{open ? "Hide" : "Show"} result
					</Link>
				) : null}
			</Stack>
			<Collapse in={open} unmountOnExit>
				<Typography
					color="text.secondary"
					component="pre"
					data-testid="task-step-result"
					sx={{
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
						maxHeight: 240,
						overflow: "auto",
						m: 0,
						ml: 3,
						mt: 0.5,
					}}
					variant="caption"
				>
					{step.result}
				</Typography>
			</Collapse>
		</Box>
	);
}

// The tools a Task mode reply used, in order, each with its result on request.
export function TaskSteps({ steps }: { steps: TaskStep[] }): React.JSX.Element {
	return (
		<Stack data-testid="task-steps" spacing={0.5} sx={{ mb: 1 }}>
			{steps.map((step) => (
				<Step key={step.id} step={step} />
			))}
		</Stack>
	);
}
