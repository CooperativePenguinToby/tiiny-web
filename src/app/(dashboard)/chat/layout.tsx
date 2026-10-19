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
			<Typography variant="h4">{t("chat.title")}</Typography>
			<RouteTabs
				tabs={[
					{ label: t("chat.tabs.chat"), href: paths.dashboard.chat },
					{ label: t("chat.tabs.history"), href: paths.dashboard.history },
				]}
			/>
			{children}
		</Stack>
	);
}
