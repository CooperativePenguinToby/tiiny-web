import { NextResponse } from "next/server";
import { networkOverview } from "@/server/network";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async () => NextResponse.json(await networkOverview()));
