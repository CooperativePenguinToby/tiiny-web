import * as React from "react";
import type { Metadata } from "next";

import { config } from "@/config";
import { getT } from "@/i18n/server";
import { Playground } from "@/components/dashboard/playground/playground";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("titles.page", { page: t("titles.playground"), site: config.site.name }) };
}

export default function Page(): React.JSX.Element {
	return <Playground kind="asr" />;
}
