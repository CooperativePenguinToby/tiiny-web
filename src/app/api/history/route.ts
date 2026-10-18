import { NextResponse } from "next/server";
import { listConversations } from "@/server/history";
import { apiRoute } from "@/server/route";

export const GET = apiRoute(async () => NextResponse.json(await listConversations()));
