import * as React from "react";
import type { Metadata } from "next";

import { config } from "@/config";
import { DeviceOverview } from "@/components/dashboard/overview/device-overview";

export const metadata = { title: `Overview | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return <DeviceOverview />;
}
