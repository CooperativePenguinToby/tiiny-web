import * as React from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { ConnectorsPanel } from "@/components/dashboard/connectors/connectors-panel";

interface LayoutProperties {
	children: React.ReactNode;
}

// The panel stays mounted while the "Add an MCP server" dialog opens and closes at its own routes.
export default function Layout({ children }: LayoutProperties): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">Connectors</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					Email, calendars, messaging and MCP tools that models can use in Task mode.
				</Typography>
			</div>
			<ConnectorsPanel />
			{children}
		</Stack>
	);
}
