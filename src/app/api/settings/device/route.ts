import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

import type { DeviceInfo } from "@/types/device";

interface SysDeviceInfo {
	device_model_name: string;
	device_model_date: string;
	tiiny_os: string;
	cpu: string;
	gpu: string;
	dnpu: string;
	peak_int8: string;
	ram: string;
	storage: string;
	network: string;
}
interface Connect {
	device_id: string;
	user_info?: { device_name?: string };
}

export const GET = apiRoute(async () => {
	const [info, connect] = await Promise.all([
		deviceJson<SysDeviceInfo>("/api/v1/sys/device_info"),
		deviceJson<Connect>("/api/v1/connect", { method: "POST", service: "auth", body: {} }),
	]);
	const body: DeviceInfo = {
		name: connect.user_info?.device_name ?? "",
		serial: connect.device_id,
		model: info.device_model_name,
		modelDate: info.device_model_date,
		os: info.tiiny_os,
		specs: [
			{ label: "CPU", value: info.cpu },
			{ label: "GPU", value: info.gpu },
			{ label: "dNPU", value: info.dnpu },
			{ label: "Peak INT8", value: info.peak_int8 },
			{ label: "RAM", value: info.ram },
			{ label: "Storage", value: info.storage },
			{ label: "Network", value: info.network },
		],
	};
	return NextResponse.json(body);
});
