import type { Metadata } from "next";

import { config } from "@/config";

export const metadata = { title: `Connectors | ${config.site.name}` } satisfies Metadata;

// The Connectors layout renders the page; this route only selects what it shows.
export default function Page(): null {
	return null;
}
