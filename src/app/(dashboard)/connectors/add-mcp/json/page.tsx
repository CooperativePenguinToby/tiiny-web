import type { Metadata } from "next";

import { config } from "@/config";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("titles.page", { page: t("titles.connectors"), site: config.site.name }) };
}

// The Connectors layout renders the page; at this route it opens the "Add an MCP server" dialog.
export default function Page(): null {
	return null;
}
