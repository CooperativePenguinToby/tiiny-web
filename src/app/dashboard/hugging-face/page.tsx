import * as React from "react";
import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { HuggingFacePanel } from "@/components/dashboard/hugging-face/hugging-face-panel";

export const metadata = { title: `Hugging Face | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">Hugging Face</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					Import custom models from Hugging Face. The device decides what it can import: typically fine-tunes and LoRA
					adapters of models in its store, some only after that store model is downloaded.
				</Typography>
			</div>
			<HuggingFacePanel />
		</Stack>
	);
}
