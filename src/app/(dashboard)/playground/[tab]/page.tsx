import * as React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { config } from "@/config";
import { getT } from "@/i18n/server";
import { Playground } from "@/components/dashboard/playground/playground";
import { playgroundTabs } from "@/components/dashboard/playground/tabs";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("titles.page", { page: t("titles.playground"), site: config.site.name }) };
}

export default async function Page({ params }: { params: Promise<{ tab: string }> }): Promise<React.JSX.Element> {
	const { tab } = await params;
	// Only the tabs' own slugs are pages; the first tab lives at the Playground itself.
	const entry = playgroundTabs.find((candidate) => candidate.slug && candidate.slug === tab);
	if (!entry) notFound();
	return <Playground kind={entry.kind} />;
}
