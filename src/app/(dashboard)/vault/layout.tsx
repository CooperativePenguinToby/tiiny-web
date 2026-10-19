import * as React from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { paths } from "@/paths";
import { RouteTabs } from "@/components/dashboard/layout/route-tabs";

interface LayoutProperties {
	children: React.ReactNode;
}

export default function Layout({ children }: LayoutProperties): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">Vault</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					The device&apos;s knowledge base: your files and summaries of past chats, indexed on the device for models to
					search.
				</Typography>
			</div>
			<RouteTabs
				tabs={[
					{ label: "Files", href: paths.dashboard.vault },
					{ label: "Chat history", href: paths.dashboard.vaultChatHistory },
				]}
			/>
			{children}
		</Stack>
	);
}
