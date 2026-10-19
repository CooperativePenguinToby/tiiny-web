import * as React from "react";
import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { AgentsPanel } from "@/components/dashboard/agents/agents-panel";

export const metadata = { title: `Agents | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">Agents</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					Agents installed on the device open here over HTTPS, behind this app&apos;s sign-in.
				</Typography>
			</div>
			<AgentsPanel />
		</Stack>
	);
}
