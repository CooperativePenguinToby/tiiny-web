import * as React from "react";
import Card from "@mui/material/Card";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { RouteTabs } from "@/components/dashboard/layout/route-tabs";
import { playgroundHref, playgroundTabs } from "@/components/dashboard/playground/tabs";

interface LayoutProperties {
	children: React.ReactNode;
}

export default function Layout({ children }: LayoutProperties): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">Playground</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					Try the device&apos;s speech, vision, embedding and rerank models, and benchmark text models (as the tiiny CLI
					does). A model loads on its first run.
				</Typography>
			</div>
			<Card>
				<RouteTabs
					scrollButtons="auto"
					sx={{ px: 2 }}
					tabs={playgroundTabs.map((tab) => ({ label: tab.label, href: playgroundHref(tab.slug) }))}
					variant="scrollable"
				/>
				<Divider />
				{children}
			</Card>
		</Stack>
	);
}
