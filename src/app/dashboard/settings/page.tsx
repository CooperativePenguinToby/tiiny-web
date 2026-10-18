import * as React from "react";
import type { Metadata } from "next";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { ApiAccessCard } from "@/components/dashboard/settings/api-access-card";
import { DeviceCard } from "@/components/dashboard/settings/device-card";
import { NetworkCard } from "@/components/dashboard/settings/network-card";
import { PersonalizationCard } from "@/components/dashboard/settings/personalization-card";
import { PowerCard } from "@/components/dashboard/settings/power-card";
import { StorageCard } from "@/components/dashboard/settings/storage-card";

export const metadata = { title: `Settings | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">Settings</Typography>
				<Typography color="text.secondary" variant="body2">
					The device&apos;s own settings, as in TiinyOS.
				</Typography>
			</div>
			<Grid container spacing={3}>
				<Grid size={{ lg: 6, xs: 12 }}>
					<Stack spacing={3}>
						<DeviceCard />
						<PersonalizationCard />
						<PowerCard />
						<ApiAccessCard />
					</Stack>
				</Grid>
				<Grid size={{ lg: 6, xs: 12 }}>
					<Stack spacing={3}>
						<StorageCard />
						<NetworkCard />
					</Stack>
				</Grid>
			</Grid>
		</Stack>
	);
}
