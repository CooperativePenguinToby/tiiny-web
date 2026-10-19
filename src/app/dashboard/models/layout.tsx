import * as React from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { ModelsTabs } from "@/components/dashboard/models/models-tabs";

interface LayoutProperties {
	children: React.ReactNode;
}

// Models, Store and Hugging Face are tabs of one page; each tab is its own route, so only the selected
// tab's page is mounted and fetches its data.
export default function Layout({ children }: LayoutProperties): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<Typography variant="h4">Models</Typography>
			<ModelsTabs />
			{children}
		</Stack>
	);
}
