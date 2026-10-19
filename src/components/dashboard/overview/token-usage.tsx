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
import { useTranslation } from "react-i18next";

import type { WeekUsage } from "@/types/device";
import { useFormat, useLanguage } from "@/i18n/client";
import { usePolling } from "@/hooks/use-polling";

// Categorical slots in fixed order (validated palette); models past the fifth fold into "Other".
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHER_COLOR = "#8b8a85";
const CHART_HEIGHT = 180;

const mondayOf = (date: dayjs.Dayjs): dayjs.Dayjs => date.subtract((date.day() + 6) % 7, "day").startOf("day");

interface Series {
	name: string;
	color: string;
	models: string[];
}

// Orders strings by UTF-16 code units, exactly as `sort()` does without a compare function.
const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function seriesFor(usage: WeekUsage, otherName: string): Series[] {
	const totals = new Map<string, number>();
	for (const day of usage.days) {
		for (const [model, counts] of Object.entries(day.models)) {
			totals.set(model, (totals.get(model) ?? 0) + counts.totalTokens);
		}
	}
	// Order by name, not size, so a model keeps its color as the week changes.
	const ranked = [...totals].toSorted((a, b) => b[1] - a[1]).map(([model]) => model);
	const named = ranked.slice(0, SERIES.length).toSorted(byCodeUnits);
	const series: Series[] = named.map((model, index) => ({ name: model, color: SERIES[index], models: [model] }));
	const rest = ranked.slice(SERIES.length);
	if (rest.length > 0) series.push({ name: otherName, color: OTHER_COLOR, models: rest });
	return series;
}

// Day and week labels. English keeps its day-month order ("Mon 6 Oct"), so it is formatted as en-GB.
function useDates(): Record<"day" | "weekday" | "monthDay" | "fullDate", (date: string | dayjs.Dayjs) => string> {
	const language = useLanguage();
	return React.useMemo(() => {
		const locale = language === "en" ? "en-GB" : language;
		const formatter = (options: Intl.DateTimeFormatOptions) => {
			const format = new Intl.DateTimeFormat(locale, options);
			// Dates are device days ("YYYY-MM-DD"), read as local midnight as dayjs does.
			return (date: string | dayjs.Dayjs): string => format.format(dayjs(date).toDate());
		};
		return {
			day: formatter({ weekday: "short", day: "numeric", month: "short" }),
			weekday: formatter({ weekday: "short" }),
			monthDay: formatter({ day: "numeric", month: "short" }),
			fullDate: formatter({ day: "numeric", month: "short", year: "numeric" }),
		};
	}, [language]);
}

const dayTotal = (models: WeekUsage["days"][number]["models"], names: string[]): number =>
	names.reduce((sum, name) => sum + (models[name]?.totalTokens ?? 0), 0);

function WeekChart({ usage }: { usage: WeekUsage }): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	const dates = useDates();
	const series = seriesFor(usage, t("overview.usage.other"));
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
								aria-label={t("overview.usage.dayBar", {
									day: dates.day(day.date),
									tokens: t("overview.usage.tokens", { count: total, value: format.count(total) }),
								})}
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
											title={t("overview.usage.segment", {
												day: dates.day(day.date),
												model: entry.name,
												tokens: t("overview.usage.tokens", { count: tokens, value: format.number(tokens) }),
											})}
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
								{dates.weekday(day.date)}
							</Typography>
						</Stack>
					);
				})}
			</Stack>
		</Stack>
	);
}

function WeekTable({ usage }: { usage: WeekUsage }): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	const dates = useDates();
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
				{t("overview.usage.empty")}
			</Typography>
		);
	}
	return (
		<Table aria-label={t("overview.usage.table.label")} size="small">
			<TableHead>
				<TableRow>
					<TableCell>{t("overview.usage.table.day")}</TableCell>
					<TableCell>{t("overview.usage.table.model")}</TableCell>
					<TableCell align="right">{t("overview.usage.table.requests")}</TableCell>
					<TableCell align="right">{t("overview.usage.table.prompt")}</TableCell>
					<TableCell align="right">{t("overview.usage.table.completion")}</TableCell>
					<TableCell align="right">{t("overview.usage.table.total")}</TableCell>
				</TableRow>
			</TableHead>
			<TableBody>
				{rows.map(({ date, model, counts }) => (
					<TableRow data-testid={`usage-row-${date}-${model}`} key={`${date}-${model}`}>
						<TableCell>{dates.day(date)}</TableCell>
						<TableCell>{model}</TableCell>
						<TableCell align="right">{format.number(counts.requests)}</TableCell>
						<TableCell align="right">{format.number(counts.promptTokens)}</TableCell>
						<TableCell align="right">{format.number(counts.completionTokens)}</TableCell>
						<TableCell align="right">{format.number(counts.totalTokens)}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

export function TokenUsage(): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	const dates = useDates();
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
								<IconButton
									aria-label={t("overview.usage.previousWeek")}
									onClick={() => setWeek(week.subtract(1, "week"))}
								>
									<CaretLeftIcon />
								</IconButton>
								<Typography data-testid="usage-week" variant="body2">
									{t("overview.usage.weekRange", {
										start: dates.monthDay(week),
										end: dates.fullDate(week.add(6, "day")),
									})}
								</Typography>
								<IconButton
									aria-label={t("overview.usage.nextWeek")}
									disabled={isCurrentWeek}
									onClick={() => setWeek(week.add(1, "week"))}
								>
									<CaretRightIcon />
								</IconButton>
							</Stack>
						}
						subheader={
							usage
								? t("overview.usage.subheader", {
										tokens: t("overview.usage.tokens", { count: weekTokens, value: format.count(weekTokens) }),
										requests: t("overview.usage.requests", {
											count: weekRequests,
											value: format.number(weekRequests),
										}),
									})
								: t("overview.usage.subheaderLoading")
						}
						title={t("overview.usage.title")}
					/>
					<Divider />
					<CardContent>
						{error && !usage ? <Alert severity="error">{error}</Alert> : null}
						{usage ? (
							<Stack spacing={2}>
								{asTable ? <WeekTable usage={usage} /> : <WeekChart usage={usage} />}
								<Box>
									<Button onClick={() => setAsTable(!asTable)} size="small">
										{t(asTable ? "overview.usage.showChart" : "overview.usage.showTable")}
									</Button>
								</Box>
							</Stack>
						) : isLoading || !error ? (
							<Stack sx={{ alignItems: "center", py: 4 }}>
								<CircularProgress aria-label={t("overview.usage.loading")} />
							</Stack>
						) : null}
					</CardContent>
				</Card>
			</Grid>
			<Grid size={{ lg: 4, xs: 12 }}>
				<Card data-testid="app-usage" sx={{ height: "100%" }}>
					<CardHeader subheader={t("overview.apps.subheader")} title={t("overview.apps.title")} />
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
								{t("overview.apps.empty")}
							</Typography>
						) : (
							<Table aria-label={t("overview.apps.label")} size="small">
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
												{format.number(app.totalTokens)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)
					) : (
						<Stack sx={{ alignItems: "center", py: 4 }}>
							<CircularProgress aria-label={t("overview.apps.loading")} />
						</Stack>
					)}
				</Card>
			</Grid>
		</Grid>
	);
}
