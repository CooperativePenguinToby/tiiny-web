import * as React from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { paths } from "@/paths";
import { RouteTabs } from "@/components/dashboard/layout/route-tabs";

interface LayoutProperties {
	children: React.ReactNode;
}

export default function Layout({ children }: LayoutProperties): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<Typography variant="h4">Models</Typography>
			<RouteTabs
				tabs={[
					{ label: "Models", href: paths.dashboard.models },
					{ label: "Store", href: paths.dashboard.store },
					{ label: "Hugging Face", href: paths.dashboard.huggingFace },
				]}
			/>
			{children}
		</Stack>
	);
}
