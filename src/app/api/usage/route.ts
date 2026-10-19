import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { deviceWeekStart } from "@/server/device-clock";
import { apiRoute } from "@/server/route";

import type { WeekUsage } from "@/types/device";
import { getT } from "@/i18n/server";

type DeviceWeek = Record<
	string,
	Record<string, { prompt_tokens: number; completion_tokens: number; total_tokens: number; request_count: number }>
>;
type DeviceApps = Record<string, { total_tokens: number; models: Record<string, number> }>;

// GET [?week=YYYY-MM-DD, a Monday; default the device's current week]. The device counts tokens of
// text-generation models only.
export const GET = apiRoute(async (request) => {
	const currentWeekStart = await deviceWeekStart();
	const week = new URL(request.url).searchParams.get("week") ?? currentWeekStart;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(week))
		throw new DeviceError("errors.request.dateFormat", 400, { field: "week", example: "2026-10-12" });
	const t = await getT();
	const query = `start_date=${week}`;
	const [days, apps] = await Promise.all([
		deviceJson<DeviceWeek>(`/api/v1/statistics/week_usage?${query}`),
		deviceJson<DeviceApps>(`/api/v1/statistics/app_week_usage?${query}`),
	]);
	const body: WeekUsage = {
		weekStart: week,
		currentWeekStart,
		days: Object.entries(days)
			.toSorted(([a], [b]) => a.localeCompare(b))
			.map(([date, models]) => ({
				date,
				models: Object.fromEntries(
					Object.entries(models).map(([model, counts]) => [
						model,
						{
							promptTokens: counts.prompt_tokens,
							completionTokens: counts.completion_tokens,
							totalTokens: counts.total_tokens,
							requests: counts.request_count,
						},
					])
				),
			})),
		apps: Object.entries(apps)
			.map(([app, usage]) => ({
				app: app === "default" ? t("server.usage.otherApps") : app,
				totalTokens: usage.total_tokens,
				models: usage.models,
			}))
			.toSorted((a, b) => b.totalTokens - a.totalTokens),
	};
	return NextResponse.json(body);
});
