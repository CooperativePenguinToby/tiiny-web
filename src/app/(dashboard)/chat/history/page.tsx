import * as React from "react";
import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { HistoryList } from "@/components/dashboard/history/history-list";

export const metadata = { title: `History | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<Typography
				variant="body2"
				sx={{
					color: "text.secondary",
				}}
			>
				Conversations kept on the device, from this app and from TiinyOS.
			</Typography>
			<HistoryList />
		</Stack>
	);
}
