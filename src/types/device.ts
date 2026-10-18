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
	// "image" models (text-to-image) draw a picture from the prompt instead of replying.
	kind: "chat" | "image";
	// Downloaded but not loaded models are listed too; choosing one in chat loads it.
	loaded: boolean;
	npuUsage: number;
	activeRequests: number;
	supportsVision: boolean;
	thinking: { supported: boolean; toggleable: boolean; levels: string[]; defaultLevel: string | null };
}

// A file sent with a chat message: images go to the device's media store (models fetch them from there),
// documents are turned into text by the device.
export type Attachment =
	| { kind: "image"; mediaId: string; url: string; name: string; mimeType: string }
	| { kind: "document"; name: string; text: string };

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
	attachments?: Attachment[];
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
	details: ModelDetails;
}

// What the store says about a model beyond its listing, as TiinyOS shows on its model details page.
export interface ModelDetails {
	input: string;
	output: string;
	contextWindow: number | null;
	recommendRank: number | null;
	image: { size: string; steps: number | null; guidanceScale: string | null } | null;
	thinking: { supported: boolean; toggleable: boolean; levels: string[]; defaultLevel: string | null };
	loadSeconds: number | null;
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
	// While the agent is being installed: whether the download runs or is paused, and how far it got.
	install: { state: "running" | "paused"; percent: number } | null;
	service: {
		id: string;
		status: string;
		version: string | null;
		port: number | null;
		proxy: { listening: boolean; error: string | null } | null;
		// A newer version from the agent store, if the device reports one.
		update: { latestVersion: string } | null;
		usage: { cpuPercent: number; memoryBytes: number } | null;
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

export interface DeviceInfo {
	name: string;
	serial: string;
	model: string;
	modelDate: string;
	os: string;
	specs: { label: string; value: string }[];
}

export interface StorageOverview {
	totalBytes: number;
	usedBytes: number;
	categories: { name: string; sizeBytes: number }[];
	models: { modelId: string; sizeBytes: number; protected: boolean }[];
	agents: { serviceId: string; sizeBytes: number }[];
}

// How other apps reach the device's models over the LAN.
export interface ApiAccess {
	openai: string;
	anthropic: string;
	ollama: string;
}

export interface WifiNetwork {
	ssid: string;
	signal: number;
	needsPassword: boolean;
	saved: boolean;
	autoJoin: boolean;
	connected: boolean;
	connecting: boolean;
}

// Wi-Fi state and interfaces; the network list is separate because the device scans to answer it.
export interface NetworkOverview {
	wifi: { enabled: boolean; connected: boolean; ssid: string | null; signal: number | null; error: string | null };
	interfaces: { name: string; state: string; addresses: string[] }[];
	// The interface this app reaches the device through; Wi-Fi changes that would drop it are refused.
	linkInterface: string | null;
}

export type WifiAction =
	| { action: "auto-join"; ssid: string; enabled: boolean }
	| { action: "connect"; ssid: string; password?: string }
	| { action: "forget"; ssid: string }
	| { action: "radio"; enabled: boolean };

export interface SystemUpdate {
	currentVersion: string;
	availableVersion: string;
	updateAvailable: boolean;
	required: boolean;
	notes: string;
	// Upgrade state on the device: idle, downloading, preparing, prepared, installing, rebooting, success, failed…
	state: string;
	progress: number;
	error: string | null;
}

export interface TokenCounts {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	requests: number;
}

// Token usage the device recorded for one week (Monday first), per day × model and per app.
export interface WeekUsage {
	weekStart: string;
	// Monday of the device's current week (the device counts days in its own time zone).
	currentWeekStart: string;
	days: { date: string; models: Record<string, TokenCounts> }[];
	apps: { app: string; totalTokens: number; models: Record<string, number> }[];
}

// What TiinyOS calls Personalization: given to models as context in Task mode.
export interface Personalization {
	userName: string;
	occupation: string;
	preferences: string;
	recentFocus: string;
}

export interface VaultFile {
	sourceId: string;
	filename: string;
	sizeBytes: number;
	addedAt: string;
	indexed: boolean;
	// The device's own vectorize status ("success", "failed"…) and error, if any.
	indexStatus: string | null;
	indexError: string | null;
	chunks: number;
}

export interface VaultSearchResult {
	entryId: string;
	source: string;
	content: string;
	timestamp: string;
}

// One parsed event from the device's upload or indexing stream, as forwarded to the browser.
export interface VaultEvent {
	source_id?: string;
	filename?: string | null;
	stage?: string;
	message?: string;
	progress_percent?: number;
	processed_chunks?: number;
	total_chunks?: number;
	success?: boolean;
	finalized?: boolean;
	error?: string;
	error_type?: string;
}

// A day of chats the device summarised into Vault ("Chat history" in TiinyOS).
export interface DailySummary {
	sourceId: string;
	day: string;
	preview: string;
}

export interface MemorySettings {
	// What the device reports; it summarises only while a model is chosen.
	enabled: boolean;
	modelId: string;
	startHour: number;
	startMinute: number;
	// Downloaded text-generation models that can write the summaries.
	models: { modelId: string; name: string }[];
}

export interface ConversationSummary {
	conversationId: string;
	title: string;
	createdAt: string;
	updatedAt: string;
}

export interface StoredTurn {
	role: "user" | "assistant";
	content: string;
	attachments?: Attachment[];
	steps?: TaskStep[];
	reasoning?: string;
	modelId: string | null;
	// "success", or "paused" for a reply that was stopped.
	status: string;
}

export interface Conversation extends ConversationSummary {
	turns: StoredTurn[];
}

// One exchange to store: the user's message and the reply.
export interface TurnToSave {
	conversationId: string | null;
	modelId: string;
	user: string;
	attachments?: Attachment[];
	assistant: {
		content: string;
		reasoning?: string;
		thinkingMs?: number;
		stopped: boolean;
		attachments?: Attachment[];
		// Task mode: the tools the model used, in order.
		steps?: TaskStep[];
	};
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

// Sizes the device's image models accept (width × height); all are multiples of 16 within its pixel limit.
export const IMAGE_SIZES = [
	"512x512",
	"768x432",
	"432x768",
	"768x480",
	"480x768",
	"640x480",
	"480x640",
	"1024x1024",
	"1280x960",
	"960x1280",
	"1536x864",
	"864x1536",
	"1536x960",
	"960x1536",
] as const;

// One parsed event from the device's image stream, as forwarded to the browser.
export interface ImageEvent {
	status?: string;
	step?: number;
	total_steps?: number;
	progress?: number;
	image?: string;
	error?: string;
	message?: string;
}

// A connector of the device (it lets models act on an outside service in Task mode).
export interface Connector {
	key: ConnectorKey;
	name: string;
	category: "email" | "calendar" | "messaging";
	connected: boolean;
	// Account or bot name once connected, or the device's explanation otherwise.
	detail: string;
}

export type ConnectorKey =
	| "gmail"
	| "google-calendar"
	| "outlook-mail"
	| "outlook-calendar"
	| "email"
	| "telegram"
	| "discord"
	| "x"
	| "whatsapp";

export interface McpServer {
	id: string;
	name: string;
	transport: string;
	target: string;
	enabled: boolean;
	connected: boolean | null;
	detail: string;
}

export interface McpTool {
	name: string;
	description: string;
}

// One tool the model used during a Task mode reply.
export interface TaskStep {
	id: string;
	tool: string;
	// Short description for people, e.g. "Searched Vault: lighthouse colour".
	label: string;
	arguments: string;
	result?: string;
	ok?: boolean;
}

// Events of /api/chat/task's stream.
export type TaskEvent =
	| { type: "delta"; content?: string; reasoning?: string }
	| { type: "step"; step: TaskStep }
	| { type: "step-result"; id: string; ok: boolean; result: string }
	| { type: "usage"; usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }
	| { type: "error"; message: string }
	| { type: "done" };
