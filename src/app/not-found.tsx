import * as React from "react";
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { BackHomeButton } from "@/components/core/back-home-button";

export const metadata = { title: `Not found | ${config.site.name}` } satisfies Metadata;

export default function NotFound(): React.JSX.Element {
	return (
		<Box component="main" sx={{ alignItems: "center", display: "flex", justifyContent: "center", minHeight: "100%" }}>
			<Stack spacing={3} sx={{ alignItems: "center", maxWidth: "md" }}>
				<Typography variant="h3" sx={{ textAlign: "center" }}>
					404: The page you are looking for isn&apos;t here
				</Typography>
				<Typography
					variant="body1"
					sx={{
						color: "text.secondary",
						textAlign: "center",
					}}
				>
					Use the navigation to get back to the dashboard.
				</Typography>
				<BackHomeButton />
			</Stack>
		</Box>
	);
}
