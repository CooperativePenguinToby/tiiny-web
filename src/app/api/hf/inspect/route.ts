import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { cachedVerdict, hfUrlFrom, rememberVerdict } from "@/server/hf";
import { apiRoute } from "@/server/route";

import type { HfInspection } from "@/types/device";

interface Inspection {
	hf?: { repo_id?: string };
	model?: { size_bytes?: number; toolkit_size_bytes?: number };
	model_task?: { label?: string };
	disk_space?: { sufficient: boolean; required_bytes: number; available_bytes: number };
	import_support?: {
		supported: boolean;
		reason_code: string | null;
		message: string | null;
		base_model_id: string | null;
		toolkit_id: string | null;
		candidates?: { toolkit_id: string; requires_download: boolean }[];
	};
	lora?: { is_lora: boolean };
	error?: {
		reason?: string;
		message?: string;
		reason_code?: string;
		resolution?: string;
		required_base_model?: { model_id: string; display_name: string };
	} | null;
}

// Asks the device whether (and how) it could import a Hugging Face repo. Nothing is downloaded.
// `{ cached: true }` (used by the compatibility list) may answer from a recent verdict; the default
// always asks the device, since disk space and toolkit state change.
export const POST = apiRoute(async (request) => {
	// Read from a copy: hfUrlFrom reads the request itself.
	const copy = request.clone();
	let options: { cached?: unknown } = {};
	try {
		options = (await copy.json()) as { cached?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { cached } = options;
	const hfUrl = await hfUrlFrom(request);
	if (cached === true) {
		const hit = cachedVerdict<HfInspection>(hfUrl);
		if (hit) return NextResponse.json(hit);
	}
	const result = await deviceJson<Inspection>("/api/v1/models/import/inspect", {
		method: "POST",
		body: { hf_url: hfUrl },
	});
	const support = result.import_support;
	const toolkit = support?.candidates?.find((candidate) => candidate.toolkit_id === support.toolkit_id);
	const isSupported = Boolean(support?.supported) && !result.error;
	const requiredBase = result.error?.resolution === "install_base_model" ? result.error.required_base_model : undefined;
	const body: HfInspection = {
		repoId: result.hf?.repo_id ?? hfUrl.replace("https://huggingface.co/", ""),
		verdict: isSupported ? "compatible" : requiredBase ? "needs-base-model" : "incompatible",
		requiredBaseModel: requiredBase ? { modelId: requiredBase.model_id, name: requiredBase.display_name } : null,
		supported: isSupported,
		reasonCode: result.error?.reason_code ?? support?.reason_code ?? null,
		reason: result.error?.reason ?? support?.message ?? result.error?.message ?? null,
		isLora: result.lora?.is_lora ?? false,
		baseModelId: support?.base_model_id ?? null,
		toolkit: toolkit
			? {
					id: toolkit.toolkit_id,
					requiresDownload: toolkit.requires_download,
					sizeBytes: result.model?.toolkit_size_bytes ?? 0,
				}
			: null,
		task: result.model_task?.label ?? null,
		sizeBytes: result.model?.size_bytes ?? 0,
		disk: result.disk_space
			? {
					sufficient: result.disk_space.sufficient,
					requiredBytes: result.disk_space.required_bytes,
					availableBytes: result.disk_space.available_bytes,
				}
			: null,
	};
	rememberVerdict(hfUrl, body);
	return NextResponse.json(body);
});
