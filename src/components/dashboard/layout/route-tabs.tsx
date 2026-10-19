"use client";

import * as React from "react";
import RouterLink from "next/link";
import { usePathname } from "next/navigation";
import Tab from "@mui/material/Tab";
import Tabs, { type TabsProps } from "@mui/material/Tabs";

interface RouteTabsProperties extends Omit<TabsProps, "children" | "value"> {
	tabs: { label: string; href: string }[];
}

// Tabs where each tab is its own route, so only the selected tab's page is mounted and fetches its data.
export function RouteTabs({ tabs, ...properties }: RouteTabsProperties): React.JSX.Element {
	const pathname = usePathname();
	const selected = tabs.find((tab) => tab.href === pathname)?.href ?? false;
	return (
		<Tabs {...properties} value={selected}>
			{tabs.map((tab) => (
				<Tab component={RouterLink} href={tab.href} key={tab.href} label={tab.label} value={tab.href} />
			))}
		</Tabs>
	);
}
