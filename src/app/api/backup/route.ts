import { NextResponse } from "next/server";
import { backupCategories } from "@/server/backup";
import { apiRoute } from "@/server/route";

import { getT } from "@/i18n/server";

export const GET = apiRoute(async () => NextResponse.json(await backupCategories(await getT())));
