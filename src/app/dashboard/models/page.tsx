import * as React from "react";
import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { ModelsTable } from "@/components/dashboard/models/models-table";

export const metadata = { title: `Models | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">Models</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					Load a downloaded model into NPU memory, or unload it to free space.
				</Typography>
			</div>
			<ModelsTable />
		</Stack>
	);
}
