import { NextResponse } from "next/server";
import { listConnectors } from "@/server/connectors";
import { apiRoute } from "@/server/route";

import { getT } from "@/i18n/server";

export const GET = apiRoute(async () => NextResponse.json(await listConnectors(await getT())));
