import * as React from "react";
import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { VaultFiles } from "@/components/dashboard/vault/vault-files";

export const metadata = { title: `Vault | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">Vault</Typography>
				<Typography color="text.secondary" variant="body2">
					The device&apos;s knowledge base: your files, indexed on the device for models to search.
				</Typography>
			</div>
			<VaultFiles />
		</Stack>
	);
}
