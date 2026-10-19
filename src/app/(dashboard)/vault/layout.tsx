import * as React from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { paths } from "@/paths";
import { getT } from "@/i18n/server";
import { RouteTabs } from "@/components/dashboard/layout/route-tabs";

interface LayoutProperties {
	children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProperties): Promise<React.JSX.Element> {
	const t = await getT();
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">{t("vault.layout.title")}</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					{t("vault.layout.description")}
				</Typography>
			</div>
			<RouteTabs
				tabs={[
					{ label: t("vault.layout.tabs.files"), href: paths.dashboard.vault },
					{ label: t("vault.layout.tabs.chatHistory"), href: paths.dashboard.vaultChatHistory },
				]}
			/>
			{children}
		</Stack>
	);
}
