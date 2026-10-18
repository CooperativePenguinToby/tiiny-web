import { NextResponse } from "next/server";
import { listConnectors } from "@/server/connectors";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async () => NextResponse.json(await listConnectors()));
