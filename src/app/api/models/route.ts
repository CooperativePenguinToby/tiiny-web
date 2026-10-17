import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

import type { ModelList } from "@/types/device";

interface DeviceModel {
	model_id: string;
	display_name: string;
	type: string;
	params: string;
	total_size: number;
	npu_usage: number;
	status: string;
}

export const GET = apiRoute(async () => {
	const [list, allocation] = await Promise.all([
		deviceJson<{ data: DeviceModel[] }>("/api/v1/models/?including_downloading=false"),
		deviceJson<{ npu_available: number }>("/api/v1/models/npu/status"),
	]);
	const body: ModelList = {
		npuAvailablePercent: allocation.npu_available,
		models: list.data.map((model) => ({
			modelId: model.model_id,
			name: model.display_name,
			type: model.type,
			params: model.params,
			sizeBytes: model.total_size,
			npuUsage: model.npu_usage,
			status: model.status,
		})),
	};
	return NextResponse.json(body);
});
