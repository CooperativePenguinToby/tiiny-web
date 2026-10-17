// Shapes the web API returns to the browser (normalized from the device's own responses).

export interface RunningModel {
	modelId: string;
	name: string;
	type: string;
	status: string;
	npuUsage: number;
	activeRequests: number;
}

export interface DeviceStatus {
	device: { model: string; os: string };
	npu: {
		status: string;
		statusMessage: string;
		allocatedPercent: number;
		utilizationPercent: number;
		memoryUsedBytes: number;
		memoryTotalBytes: number;
	};
	cpuPercent: number;
	memory: { usedBytes: number; totalBytes: number };
	disk: { usedBytes: number; totalBytes: number };
	running: RunningModel[];
}

export interface DownloadedModel {
	modelId: string;
	name: string;
	type: string;
	params: string;
	sizeBytes: number;
	npuUsage: number;
	status: string;
	supportsChat: boolean;
	reasoningLevels: string[];
	defaultReasoningLevel: string | null;
}
