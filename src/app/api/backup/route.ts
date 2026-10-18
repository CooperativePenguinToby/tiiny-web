import { NextResponse } from "next/server";
import { backupCategories } from "@/server/backup";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async () => NextResponse.json(await backupCategories()));
