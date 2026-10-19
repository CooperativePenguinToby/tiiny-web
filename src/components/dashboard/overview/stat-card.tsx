import * as React from "react";
import Avatar from "@mui/material/Avatar";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import { useTranslation } from "react-i18next";

import { useFormat } from "@/i18n/client";

export interface StatCardProperties {
	// Stable across languages, for tests.
	id: string;
	title: string;
	value: string;
	caption: string;
	percent: number;
	icon: Icon;
	color: string;
}

export function StatCard({
	id,
	title,
	value,
	caption,
	percent,
	icon: IconComponent,
	color,
}: StatCardProperties): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	return (
		<Card sx={{ height: "100%" }} data-testid={`stat-${id}`}>
			<CardContent>
				<Stack spacing={2}>
					<Stack direction="row" spacing={3} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
						<Stack spacing={1}>
							<Typography
								variant="overline"
								sx={{
									color: "text.secondary",
								}}
							>
								{title}
							</Typography>
							<Typography variant="h4">{value}</Typography>
						</Stack>
						<Avatar sx={{ backgroundColor: color, height: "56px", width: "56px" }}>
							<IconComponent fontSize="var(--icon-fontSize-lg)" />
						</Avatar>
					</Stack>
					<div>
						<LinearProgress
							aria-label={t("overview.stats.progress", {
								title,
								percent: t("overview.percent", { value: format.number(percent, { maximumFractionDigits: 0 }) }),
							})}
							value={Math.min(percent, 100)}
							variant="determinate"
						/>
						<Typography
							variant="caption"
							component="p"
							sx={{
								color: "text.secondary",
								mt: 1,
							}}
						>
							{caption}
						</Typography>
					</div>
				</Stack>
			</CardContent>
		</Card>
	);
}
