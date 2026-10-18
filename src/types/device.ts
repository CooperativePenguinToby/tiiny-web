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

export interface StoreModel {
	modelId: string;
	name: string;
	type: string;
	params: string;
	npuUsage: number;
	status: string;
	progress: number;
	description: string;
	likes: number;
	downloads: number;
	trending: boolean;
}

// One parsed event from the device's model download stream, as forwarded to the browser.
export interface DownloadEvent {
	status?: string;
	stage?: string;
	progress?: number;
	downloaded_bytes?: number;
	total_bytes?: number;
	error?: string;
	message?: string;
}

// The device's verdict on importing a Hugging Face repo. "needs-base-model": importable once the named
// store model is downloaded to the device.
export type HfVerdict = "compatible" | "needs-base-model" | "incompatible";

export interface HfInspection {
	repoId: string;
	verdict: HfVerdict;
	requiredBaseModel: { modelId: string; name: string } | null;
	supported: boolean;
	reasonCode: string | null;
	reason: string | null;
	isLora: boolean;
	baseModelId: string | null;
	toolkit: { id: string; requiresDownload: boolean; sizeBytes: number } | null;
	task: string | null;
	sizeBytes: number;
	disk: { sufficient: boolean; requiredBytes: number; availableBytes: number } | null;
}

export interface HfRepo {
	repoId: string;
	relation: "adapter" | "finetune";
	downloads: number;
	likes: number;
	pipelineTag: string | null;
}

// One parsed event from the device's import stream, as forwarded to the browser.
export interface ImportEvent {
	import_id?: string;
	import_status?: string;
	stage?: string;
	stage_name?: string;
	message?: string;
	global_progress?: number;
	downloaded_bytes?: number;
	total_bytes?: number;
	error?: string | { message?: string };
	error_code?: string;
}

export interface AgentDownload {
	platform: string;
	version: string;
	sizeBytes: number;
	url: string;
	sha256: string;
}

// An agent from the device's agent store. Web agents run as containers on the device; the others
// run on a computer and use the device's OpenAI-compatible API.
export interface Agent {
	appId: string;
	name: string;
	description: string;
	iconUrl: string | null;
	kind: "web" | "desktop";
	recommendedModels: string[];
	downloads: AgentDownload[];
	cloudVersion: string | null;
	service: {
		id: string;
		status: string;
		version: string | null;
		port: number | null;
		// false when the agent only listens on the device's own loopback interface; null when unknown
		// (the device reports port bindings only while the agent runs).
		reachable: boolean | null;
		proxy: { listening: boolean; error: string | null } | null;
	} | null;
}

export interface AgentEvent {
	status?: string;
	phase?: string;
	overall_progress?: number;
	downloaded_bytes?: number;
	total_bytes?: number;
	message?: string;
	error?: string | { message?: string } | null;
}
