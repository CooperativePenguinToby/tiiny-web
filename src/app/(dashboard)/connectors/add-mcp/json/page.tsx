import type { Metadata } from "next";

import { config } from "@/config";

export const metadata = { title: `Connectors | ${config.site.name}` } satisfies Metadata;

// The Connectors layout renders the page; at this route it opens the "Add an MCP server" dialog.
export default function Page(): null {
	return null;
}
