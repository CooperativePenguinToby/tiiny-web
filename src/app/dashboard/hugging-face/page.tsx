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
				<Typography color="text.secondary" variant="body2">
					Import custom models from Hugging Face. The device currently imports image-generation models and LoRA adapters
					built on its store image models.
				</Typography>
			</div>
			<HuggingFacePanel />
		</Stack>
	);
}
