import * as React from "react";
import type { Metadata } from "next";

import { config } from "@/config";
import { getT } from "@/i18n/server";
import { DeviceOverview } from "@/components/dashboard/overview/device-overview";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("titles.page", { page: t("titles.overview"), site: config.site.name }) };
}

export default function Page(): React.JSX.Element {
	return <DeviceOverview />;
}
