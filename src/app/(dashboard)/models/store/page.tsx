import * as React from "react";
import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { StoreTable } from "@/components/dashboard/store/store-table";

export const metadata = { title: `Store | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<Typography
				variant="body2"
				sx={{
					color: "text.secondary",
				}}
			>
				Models from the Tiiny store. Downloads go to the device; load them from the Models tab.
			</Typography>
			<StoreTable />
		</Stack>
	);
}
