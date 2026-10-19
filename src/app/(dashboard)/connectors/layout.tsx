import * as React from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { getT } from "@/i18n/server";
import { ConnectorsPanel } from "@/components/dashboard/connectors/connectors-panel";

interface LayoutProperties {
	children: React.ReactNode;
}

// The panel stays mounted while the "Add an MCP server" dialog opens and closes at its own routes.
export default async function Layout({ children }: LayoutProperties): Promise<React.JSX.Element> {
	const t = await getT();
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">{t("connectors.page.title")}</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					{t("connectors.page.description")}
				</Typography>
			</div>
			<ConnectorsPanel />
			{children}
		</Stack>
	);
}
