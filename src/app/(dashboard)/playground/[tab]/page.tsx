import * as React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { config } from "@/config";
import { Playground } from "@/components/dashboard/playground/playground";
import { playgroundTabs } from "@/components/dashboard/playground/tabs";

export const metadata = { title: `Playground | ${config.site.name}` } satisfies Metadata;

export default async function Page({ params }: { params: Promise<{ tab: string }> }): Promise<React.JSX.Element> {
	const { tab } = await params;
	// Only the tabs' own slugs are pages; the first tab lives at the Playground itself.
	const entry = playgroundTabs.find((candidate) => candidate.slug && candidate.slug === tab);
	if (!entry) notFound();
	return <Playground kind={entry.kind} />;
}
