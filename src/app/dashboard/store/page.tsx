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
			<div>
				<Typography variant="h4">Store</Typography>
				<Typography color="text.secondary" variant="body2">
					Models from the Tiiny store. Downloads go to the device; load them from the Models page.
				</Typography>
			</div>
			<StoreTable />
		</Stack>
	);
}
