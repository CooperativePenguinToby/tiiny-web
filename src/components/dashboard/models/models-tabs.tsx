"use client";

import * as React from "react";
import RouterLink from "next/link";
import { usePathname } from "next/navigation";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";

import { paths } from "@/paths";

const tabs = [
	{ label: "Models", href: paths.dashboard.models },
	{ label: "Store", href: paths.dashboard.store },
	{ label: "Hugging Face", href: paths.dashboard.huggingFace },
] as const;

export function ModelsTabs(): React.JSX.Element {
	const pathname = usePathname();
	const selected = tabs.find((tab) => tab.href === pathname)?.href ?? false;
	return (
		<Tabs value={selected}>
			{tabs.map((tab) => (
				<Tab component={RouterLink} href={tab.href} key={tab.href} label={tab.label} value={tab.href} />
			))}
		</Tabs>
	);
}
