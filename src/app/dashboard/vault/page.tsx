import * as React from "react";
import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { VaultTabs } from "@/components/dashboard/vault/vault-tabs";

export const metadata = { title: `Vault | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">Vault</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					The device&apos;s knowledge base: your files and summaries of past chats, indexed on the device for models to
					search.
				</Typography>
			</div>
			<VaultTabs />
		</Stack>
	);
}
