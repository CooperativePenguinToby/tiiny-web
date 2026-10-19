import * as React from "react";
import type { Metadata } from "next";
import Stack from "@mui/material/Stack";

import { config } from "@/config";
import { getT } from "@/i18n/server";
import { SummarySettings } from "@/components/dashboard/vault/summary-settings";
import { VaultMemory } from "@/components/dashboard/vault/vault-memory";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("titles.page", { page: t("titles.vault"), site: config.site.name }) };
}

export default function Page(): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<SummarySettings />
			<VaultMemory />
		</Stack>
	);
}
