import * as React from "react";
import type { Metadata } from "next";
import Stack from "@mui/material/Stack";

import { config } from "@/config";
import { SummarySettings } from "@/components/dashboard/vault/summary-settings";
import { VaultMemory } from "@/components/dashboard/vault/vault-memory";

export const metadata = { title: `Vault | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<SummarySettings />
			<VaultMemory />
		</Stack>
	);
}
