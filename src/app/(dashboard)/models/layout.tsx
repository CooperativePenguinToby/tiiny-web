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
			<Typography variant="h4">{t("models.heading")}</Typography>
			<RouteTabs
				tabs={[
					{ label: t("models.tabs.models"), href: paths.dashboard.models },
					{ label: t("models.tabs.store"), href: paths.dashboard.store },
					{ label: "Hugging Face", href: paths.dashboard.huggingFace },
				]}
			/>
			{children}
		</Stack>
	);
}
