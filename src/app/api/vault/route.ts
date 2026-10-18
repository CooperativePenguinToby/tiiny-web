import { NextResponse } from "next/server";
import { apiRoute } from "@/server/route";
import { listVaultFiles } from "@/server/vault";

export const GET = apiRoute(async () => NextResponse.json(await listVaultFiles()));
