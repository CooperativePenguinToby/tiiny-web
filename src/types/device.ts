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
}

export interface ModelList {
	npuAvailablePercent: number;
	models: DownloadedModel[];
}

// One parsed event from the device's model launch stream, as forwarded to the browser.
export interface LaunchEvent {
	status?: string;
	progress?: number;
	startup_message?: string;
	startup_error?: string;
	result?: { message?: string; progress?: number };
}

export interface ChatModel {
	modelId: string;
	name: string;
	activeRequests: number;
	thinking: { supported: boolean; toggleable: boolean; levels: string[]; defaultLevel: string | null };
}

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

// "off" disables thinking; otherwise a reasoning level the model supports.
export type ThinkingSetting = "off" | string;
