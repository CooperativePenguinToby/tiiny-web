import * as React from "react";
import type { Metadata } from "next";
import RouterLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr/ArrowLeft";

import { config } from "@/config";
import { paths } from "@/paths";

export const metadata = { title: `Not found | ${config.site.name}` } satisfies Metadata;

export default function NotFound(): React.JSX.Element {
	return (
		<Box component="main" sx={{ alignItems: "center", display: "flex", justifyContent: "center", minHeight: "100%" }}>
			<Stack spacing={3} sx={{ alignItems: "center", maxWidth: "md" }}>
				<Typography variant="h3" sx={{ textAlign: "center" }}>
					404: The page you are looking for isn&apos;t here
				</Typography>
				<Typography color="text.secondary" variant="body1" sx={{ textAlign: "center" }}>
					Use the navigation to get back to the dashboard.
				</Typography>
				<Button
					component={RouterLink}
					href={paths.home}
					startIcon={<ArrowLeftIcon fontSize="var(--icon-fontSize-md)" />}
					variant="contained"
				>
					Go back to home
				</Button>
			</Stack>
		</Box>
	);
}
