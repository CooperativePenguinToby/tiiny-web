import * as React from "react";
import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { getT } from "@/i18n/server";
import { AgentsPanel } from "@/components/dashboard/agents/agents-panel";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("titles.page", { page: t("titles.agents"), site: config.site.name }) };
}

export default async function Page(): Promise<React.JSX.Element> {
	const t = await getT();
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">{t("agents.page.title")}</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					{t("agents.page.description")}
				</Typography>
			</div>
			<AgentsPanel />
		</Stack>
	);
}
