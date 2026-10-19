import type { DailySummary, MemorySettings } from "@/types/device";

import { DeviceError, deviceJson } from "./device";
import { deviceUtcOffsetMinutes } from "./device-clock";
import { kbHeaders, listSources } from "./vault";

// Model types whose models can chat (and so summarise).
const TEXT_TYPES = new Set(["Text Generation", "Image-Text-to-Text"]);

export async function dailySummaries(): Promise<DailySummary[]> {
	const items = await listSources("conversations");
	return items
		.map((item) => {
			const chunks = (item as { chunks?: { preview?: string }[] }).chunks ?? [];
			return {
				sourceId: item.source_id,
				day: item.filename.replace(/\.txt$/, ""),
				preview: chunks
					.map((chunk) => chunk.preview ?? "")
					.join(" ")
					.trim(),
			};
		})
		.toSorted((a, b) => b.day.localeCompare(a.day));
}

interface Schedule {
	nightly_start_hour: number;
	nightly_start_minute: number;
}
interface ModelSetting {
	model_id: string;
	automatic_summary_enabled: boolean;
}
interface Downloaded {
	data: { model_id: string; display_name: string; type: string }[];
}

export async function memorySettings(): Promise<MemorySettings> {
	const headers = await kbHeaders();
	const [schedule, model, downloaded, deviceOffsetMinutes] = await Promise.all([
		deviceJson<Schedule>("/kb/memory/schedule", { service: "kb", headers }),
		deviceJson<ModelSetting>("/kb/memory/model", { service: "kb", headers }),
		deviceJson<Downloaded>("/api/v1/models/?including_downloading=false"),
		deviceUtcOffsetMinutes(),
	]);
	return {
		enabled: model.automatic_summary_enabled,
		modelId: model.model_id,
		startHour: schedule.nightly_start_hour,
		startMinute: schedule.nightly_start_minute,
		deviceOffsetMinutes,
		models: downloaded.data
			.filter((entry) => TEXT_TYPES.has(entry.type))
			.map((entry) => ({ modelId: entry.model_id, name: entry.display_name })),
	};
}

// modelId "" turns daily summaries off. The window starts at the given time, as TiinyOS sets it.
export async function saveMemorySettings(body: unknown): Promise<void> {
	const { modelId, startHour, startMinute } = body as Record<string, unknown>;
	if (typeof modelId !== "string") throw new DeviceError("modelId must be text", 400);
	if (!Number.isSafeInteger(startHour) || (startHour as number) < 0 || (startHour as number) > 23) {
		throw new DeviceError("startHour must be 0-23", 400);
	}
	if (!Number.isSafeInteger(startMinute) || (startMinute as number) < 0 || (startMinute as number) > 59) {
		throw new DeviceError("startMinute must be 0-59", 400);
	}
	const current = await memorySettings();
	if (modelId && current.models.every((model) => model.modelId !== modelId)) {
		throw new DeviceError("Choose a downloaded text model", 400);
	}
	const headers = await kbHeaders();
	await deviceJson("/kb/memory/schedule", {
		method: "PUT",
		service: "kb",
		headers,
		body: { nightly_start_hour: startHour, nightly_start_minute: startMinute },
	});
	await deviceJson("/kb/memory/model", { method: "PUT", service: "kb", headers, body: { model_id: modelId } });
}
