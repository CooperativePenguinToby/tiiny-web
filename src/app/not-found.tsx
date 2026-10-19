import * as React from "react";
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { getT } from "@/i18n/server";
import { BackHomeButton } from "@/components/core/back-home-button";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("titles.page", { page: t("titles.notFound"), site: config.site.name }) };
}

export default async function NotFound(): Promise<React.JSX.Element> {
	const t = await getT();

	return (
		<Box component="main" sx={{ alignItems: "center", display: "flex", justifyContent: "center", minHeight: "100%" }}>
			<Stack spacing={3} sx={{ alignItems: "center", maxWidth: "md" }}>
				<Typography variant="h3" sx={{ textAlign: "center" }}>
					{t("core.notFound.heading")}
				</Typography>
				<Typography
					variant="body1"
					sx={{
						color: "text.secondary",
						textAlign: "center",
					}}
				>
					{t("core.notFound.hint")}
				</Typography>
				<BackHomeButton />
			</Stack>
		</Box>
	);
}
