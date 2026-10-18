import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

import type { WeekUsage } from "@/types/device";

type DeviceWeek = Record<
	string,
	Record<string, { prompt_tokens: number; completion_tokens: number; total_tokens: number; request_count: number }>
>;
type DeviceApps = Record<string, { total_tokens: number; models: Record<string, number> }>;

// GET ?week=YYYY-MM-DD (a Monday). The device counts tokens of text-generation models only.
export const GET = apiRoute(async (request) => {
	const week = new URL(request.url).searchParams.get("week") ?? "";
	if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new DeviceError("week must be a date like 2026-10-12", 400);
	const query = `start_date=${week}`;
	const [days, apps] = await Promise.all([
		deviceJson<DeviceWeek>(`/api/v1/statistics/week_usage?${query}`),
		deviceJson<DeviceApps>(`/api/v1/statistics/app_week_usage?${query}`),
	]);
	const body: WeekUsage = {
		weekStart: week,
		days: Object.entries(days)
			.sort(([a], [b]) => a.localeCompare(b))
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
				app: app === "default" ? "API and other apps" : app,
				totalTokens: usage.total_tokens,
				models: usage.models,
			}))
			.sort((a, b) => b.totalTokens - a.totalTokens),
	};
	return NextResponse.json(body);
});
