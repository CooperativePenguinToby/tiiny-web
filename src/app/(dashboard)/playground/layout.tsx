import * as React from "react";
import Card from "@mui/material/Card";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { getT } from "@/i18n/server";
import { RouteTabs } from "@/components/dashboard/layout/route-tabs";
import { playgroundHref, playgroundTabs } from "@/components/dashboard/playground/tabs";

interface LayoutProperties {
	children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProperties): Promise<React.JSX.Element> {
	const t = await getT();
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">{t("playground.layout.title")}</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					{t("playground.layout.description")}
				</Typography>
			</div>
			<Card>
				<RouteTabs
					scrollButtons="auto"
					sx={{ px: 2 }}
					tabs={playgroundTabs.map((tab) => ({ label: t(tab.label), href: playgroundHref(tab.slug) }))}
					variant="scrollable"
				/>
				<Divider />
				{children}
			</Card>
		</Stack>
	);
}
