import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

import type { DeviceStatus } from "@/types/device";

interface NpuStatus {
	devices: { util_percent: number; mem_used_mb: number; mem_total_mb: number }[];
	cpu: { total_percent: number };
	npu: { status: string; status_message: string };
}
interface Allocation {
	npu_used: number;
}
interface SysStatus {
	memory: { used_bytes: number; total_bytes: number };
}
interface SysStorage {
	total_bytes: number;
	used_bytes: number;
}
interface DeviceInfo {
	device_model_name: string;
	tiiny_os: string;
}
export interface RunningInstance {
	model_id: string;
	display_name: string;
	type: string;
	status: string;
	npu_usage: number;
	active_request_count: number;
}
export interface RunningModels {
	instances: { running: RunningInstance[]; pending: RunningInstance[] };
}

const MB = 1024 * 1024;

export const GET = apiRoute(async () => {
	const [npu, allocation, sys, storage, info, running] = await Promise.all([
		deviceJson<NpuStatus>("/api/v1/npu/status"),
		deviceJson<Allocation>("/api/v1/models/npu/status"),
		deviceJson<SysStatus>("/api/v1/sys/status"),
		deviceJson<SysStorage>("/api/v1/sys/storage"),
		deviceJson<DeviceInfo>("/api/v1/sys/device_info"),
		deviceJson<RunningModels>("/api/v1/models/running"),
	]);
	const card = npu.devices[0];
	const status: DeviceStatus = {
		device: { model: info.device_model_name, os: info.tiiny_os },
		npu: {
			status: npu.npu.status,
			statusMessage: npu.npu.status_message,
			allocatedPercent: allocation.npu_used,
			utilizationPercent: card?.util_percent ?? 0,
			memoryUsedBytes: (card?.mem_used_mb ?? 0) * MB,
			memoryTotalBytes: (card?.mem_total_mb ?? 0) * MB,
		},
		cpuPercent: npu.cpu.total_percent,
		memory: { usedBytes: sys.memory.used_bytes, totalBytes: sys.memory.total_bytes },
		disk: { usedBytes: storage.used_bytes, totalBytes: storage.total_bytes },
		running: [...running.instances.running, ...running.instances.pending].map((instance) => ({
			modelId: instance.model_id,
			name: instance.display_name,
			type: instance.type,
			status: instance.status,
			npuUsage: instance.npu_usage,
			activeRequests: instance.active_request_count,
		})),
	};
	return NextResponse.json(status);
});
