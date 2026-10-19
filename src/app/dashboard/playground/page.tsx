import * as React from "react";
import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { Playground } from "@/components/dashboard/playground/playground";

export const metadata = { title: `Playground | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">Playground</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					Try the device&apos;s speech, vision, embedding and rerank models, and benchmark text models (as the tiiny CLI
					does). A model loads on its first run.
				</Typography>
			</div>
			<Playground />
		</Stack>
	);
}
