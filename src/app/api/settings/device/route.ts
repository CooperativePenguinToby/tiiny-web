import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

import type { DeviceInfo } from "@/types/device";
import { getT } from "@/i18n/server";

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
	const t = await getT();
	const body: DeviceInfo = {
		name: connect.user_info?.device_name ?? "",
		serial: connect.device_id,
		model: info.device_model_name,
		modelDate: info.device_model_date,
		os: info.tiiny_os,
		specs: [
			{ id: "CPU", label: "CPU", value: info.cpu },
			{ id: "GPU", label: "GPU", value: info.gpu },
			{ id: "dNPU", label: "dNPU", value: info.dnpu },
			{ id: "Peak INT8", label: t("server.settings.specs.peakInt8"), value: info.peak_int8 },
			{ id: "RAM", label: "RAM", value: info.ram },
			{ id: "Storage", label: t("server.settings.specs.storage"), value: info.storage },
			{ id: "Network", label: t("server.settings.specs.network"), value: info.network },
		],
	};
	return NextResponse.json(body);
});
