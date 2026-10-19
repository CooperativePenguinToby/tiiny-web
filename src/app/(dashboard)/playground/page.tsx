import * as React from "react";
import type { Metadata } from "next";

import { config } from "@/config";
import { Playground } from "@/components/dashboard/playground/playground";

export const metadata = { title: `Playground | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return <Playground kind="asr" />;
}
