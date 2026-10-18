import { NextResponse } from "next/server";
import { dailySummaries } from "@/server/memory";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async () => NextResponse.json(await dailySummaries()));
