import * as React from "react";
import type { Metadata } from "next";

import { config } from "@/config";
import { VaultFiles } from "@/components/dashboard/vault/vault-files";

export const metadata = { title: `Vault | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return <VaultFiles />;
}
