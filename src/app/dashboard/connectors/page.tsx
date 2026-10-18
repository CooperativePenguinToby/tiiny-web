import * as React from "react";
import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { ConnectorsPanel } from "@/components/dashboard/connectors/connectors-panel";

export const metadata = { title: `Connectors | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">Connectors</Typography>
				<Typography color="text.secondary" variant="body2">
					Email, calendars, messaging and MCP tools that models can use in Task mode.
				</Typography>
			</div>
			<ConnectorsPanel />
		</Stack>
	);
}
