"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";
import dayjs from "dayjs";

import type { WeekUsage } from "@/types/device";
import { formatCount } from "@/lib/format";
import { usePolling } from "@/hooks/use-polling";

// Categorical slots in fixed order (validated palette); models past the fifth fold into "Other".
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHER = { name: "Other", color: "#8b8a85" };
const CHART_HEIGHT = 180;

const mondayOf = (date: dayjs.Dayjs): dayjs.Dayjs => date.subtract((date.day() + 6) % 7, "day").startOf("day");

interface Series {
	name: string;
	color: string;
	models: string[];
}

function seriesFor(usage: WeekUsage): Series[] {
	const totals = new Map<string, number>();
	for (const day of usage.days) {
		for (const [model, counts] of Object.entries(day.models)) {
			totals.set(model, (totals.get(model) ?? 0) + counts.totalTokens);
		}
	}
	// Order by name, not size, so a model keeps its color as the week changes.
	const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([model]) => model);
	const named = ranked.slice(0, SERIES.length).sort();
	const series: Series[] = named.map((model, index) => ({ name: model, color: SERIES[index], models: [model] }));
	const rest = ranked.slice(SERIES.length);
	if (rest.length > 0) series.push({ ...OTHER, models: rest });
	return series;
}

const dayTotal = (models: WeekUsage["days"][number]["models"], names: string[]): number =>
	names.reduce((sum, name) => sum + (models[name]?.totalTokens ?? 0), 0);

function WeekChart({ usage }: { usage: WeekUsage }): React.JSX.Element {
	const series = seriesFor(usage);
	const max = Math.max(1, ...usage.days.map((day) => dayTotal(day.models, Object.keys(day.models))));
	return (
		<Stack spacing={2}>
			<Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", rowGap: 1 }} data-testid="usage-legend">
				{series.map((entry) => (
					<Stack direction="row" key={entry.name} spacing={0.75} sx={{ alignItems: "center" }}>
						<Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: entry.color }} />
						<Typography variant="caption">{entry.name}</Typography>
					</Stack>
				))}
			</Stack>
			<Stack direction="row" spacing={1} sx={{ alignItems: "flex-end", height: CHART_HEIGHT + 24 }}>
				{usage.days.map((day) => {
					const total = dayTotal(day.models, Object.keys(day.models));
					return (
						<Stack key={day.date} spacing={0.5} sx={{ flex: 1, alignItems: "center" }}>
							<Stack
								aria-label={`${dayjs(day.date).format("ddd D MMM")}: ${formatCount(total)} tokens`}
								data-testid={`usage-day-${day.date}`}
								role="img"
								sx={{ width: "100%", maxWidth: 40, height: CHART_HEIGHT, justifyContent: "flex-end", gap: "2px" }}
							>
								{series
									.map((entry) => ({ entry, tokens: dayTotal(day.models, entry.models) }))
									.filter(({ tokens }) => tokens > 0)
									.toReversed()
									.map(({ entry, tokens }, index) => (
										<Tooltip
											key={entry.name}
											title={`${dayjs(day.date).format("ddd D MMM")} · ${entry.name}: ${tokens.toLocaleString()} tokens`}
										>
											<Box
												sx={{
													bgcolor: entry.color,
													height: `${Math.max(2, (tokens / max) * CHART_HEIGHT)}px`,
													borderRadius: index === 0 ? "4px 4px 0 0" : 0,
												}}
											/>
										</Tooltip>
									))}
							</Stack>
							<Typography
								variant="caption"
								sx={{
									color: "text.secondary",
								}}
							>
								{dayjs(day.date).format("ddd")}
							</Typography>
						</Stack>
					);
				})}
			</Stack>
		</Stack>
	);
}

function WeekTable({ usage }: { usage: WeekUsage }): React.JSX.Element {
	const rows = usage.days.flatMap((day) =>
		Object.entries(day.models).map(([model, counts]) => ({ date: day.date, model, counts }))
	);
	if (rows.length === 0) {
		return (
			<Typography
				variant="body2"
				sx={{
					color: "text.secondary",
				}}
			>
				No tokens this week.
			</Typography>
		);
	}
	return (
		<Table aria-label="Token usage by day" size="small">
			<TableHead>
				<TableRow>
					<TableCell>Day</TableCell>
					<TableCell>Model</TableCell>
					<TableCell align="right">Requests</TableCell>
					<TableCell align="right">Prompt</TableCell>
					<TableCell align="right">Completion</TableCell>
					<TableCell align="right">Total</TableCell>
				</TableRow>
			</TableHead>
			<TableBody>
				{rows.map(({ date, model, counts }) => (
					<TableRow data-testid={`usage-row-${date}-${model}`} key={`${date}-${model}`}>
						<TableCell>{dayjs(date).format("ddd D MMM")}</TableCell>
						<TableCell>{model}</TableCell>
						<TableCell align="right">{counts.requests.toLocaleString()}</TableCell>
						<TableCell align="right">{counts.promptTokens.toLocaleString()}</TableCell>
						<TableCell align="right">{counts.completionTokens.toLocaleString()}</TableCell>
						<TableCell align="right">{counts.totalTokens.toLocaleString()}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

export function TokenUsage(): React.JSX.Element {
	// null: the device's current week (it counts days in its own time zone).
	const [chosen, setChosen] = React.useState<dayjs.Dayjs | null>(null);
	const [asTable, setAsTable] = React.useState(false);
	const { data, error, isLoading } = usePolling<WeekUsage>(
		chosen ? `/api/usage?week=${chosen.format("YYYY-MM-DD")}` : "/api/usage",
		30_000
	);
	const usage = data && (chosen === null || data.weekStart === chosen.format("YYYY-MM-DD")) ? data : null;
	const week = chosen ?? dayjs(usage?.weekStart ?? mondayOf(dayjs()).format("YYYY-MM-DD"));
	const setWeek = (next: dayjs.Dayjs): void => setChosen(next);
	const weekTokens = usage
		? usage.days.reduce((sum, day) => sum + dayTotal(day.models, Object.keys(day.models)), 0)
		: 0;
	const weekRequests = usage
		? usage.days.reduce((sum, day) => sum + Object.values(day.models).reduce((s, c) => s + c.requests, 0), 0)
		: 0;
	const isCurrentWeek = usage ? usage.weekStart === usage.currentWeekStart : chosen === null;

	return (
		<Grid container spacing={3}>
			<Grid size={{ lg: 8, xs: 12 }}>
				<Card data-testid="token-usage" sx={{ height: "100%" }}>
					<CardHeader
						action={
							<Stack direction="row" sx={{ alignItems: "center" }}>
								<IconButton aria-label="Previous week" onClick={() => setWeek(week.subtract(1, "week"))}>
									<CaretLeftIcon />
								</IconButton>
								<Typography data-testid="usage-week" variant="body2">
									{week.format("D MMM")} – {week.add(6, "day").format("D MMM YYYY")}
								</Typography>
								<IconButton
									aria-label="Next week"
									disabled={isCurrentWeek}
									onClick={() => setWeek(week.add(1, "week"))}
								>
									<CaretRightIcon />
								</IconButton>
							</Stack>
						}
						subheader={
							usage
								? `${formatCount(weekTokens)} tokens in ${weekRequests.toLocaleString()} requests (text models)`
								: "Text models"
						}
						title="Token usage"
					/>
					<Divider />
					<CardContent>
						{error && !usage ? <Alert severity="error">{error}</Alert> : null}
						{usage ? (
							<Stack spacing={2}>
								{asTable ? <WeekTable usage={usage} /> : <WeekChart usage={usage} />}
								<Box>
									<Button onClick={() => setAsTable(!asTable)} size="small">
										{asTable ? "Show chart" : "Show as table"}
									</Button>
								</Box>
							</Stack>
						) : isLoading || !error ? (
							<Stack sx={{ alignItems: "center", py: 4 }}>
								<CircularProgress aria-label="Loading token usage" />
							</Stack>
						) : null}
					</CardContent>
				</Card>
			</Grid>
			<Grid size={{ lg: 4, xs: 12 }}>
				<Card data-testid="app-usage" sx={{ height: "100%" }}>
					<CardHeader subheader="Tokens this week, by app" title="Usage by app" />
					<Divider />
					{usage ? (
						usage.apps.length === 0 ? (
							<Typography
								variant="body2"
								sx={{
									color: "text.secondary",
									p: 3,
								}}
							>
								No tokens this week.
							</Typography>
						) : (
							<Table aria-label="Usage by app" size="small">
								<TableBody>
									{usage.apps.map((app) => (
										<TableRow data-testid={`app-usage-${app.app}`} key={app.app}>
											<TableCell>
												<Typography variant="subtitle2">{app.app}</Typography>
												<Typography
													variant="caption"
													sx={{
														color: "text.secondary",
													}}
												>
													{Object.keys(app.models).join(", ")}
												</Typography>
											</TableCell>
											<TableCell align="right" data-testid={`app-usage-total-${app.app}`}>
												{app.totalTokens.toLocaleString()}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)
					) : (
						<Stack sx={{ alignItems: "center", py: 4 }}>
							<CircularProgress aria-label="Loading app usage" />
						</Stack>
					)}
				</Card>
			</Grid>
		</Grid>
	);
}
