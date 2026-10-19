import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { withModel } from "@/server/models";
import { modelIdOf } from "@/server/playground";
import { apiRoute } from "@/server/route";
import { FormData as DeviceForm } from "undici";

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

// Multipart: model, file (audio), language (optional). Returns { text }.
export const POST = apiRoute(async (request) => {
	let form: FormData | null = null;
	try {
		form = await request.formData();
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const model = modelIdOf(form?.get("model"));
	const file = form?.get("file");
	if (!(file instanceof File) || file.size === 0) throw new DeviceError("errors.playground.chooseAudio", 400);
	if (file.size > MAX_AUDIO_BYTES) throw new DeviceError("errors.playground.audioTooLarge", 400, { megabytes: 100 });
	// The device transcribes WAV; given MP3 it never answers (TiinyOS 0.1.35).
	const header = Buffer.from(await file.slice(0, 12).arrayBuffer());
	if (header.toString("latin1", 0, 4) !== "RIFF" || header.toString("latin1", 8, 12) !== "WAVE") {
		throw new DeviceError("errors.playground.wavOnly", 400);
	}
	const language = form?.get("language");
	// A multipart body is sent once, so each attempt builds its own.
	const result = await withModel(model, () => {
		const body = new DeviceForm();
		body.append("model", model);
		body.append("file", file, file.name || "audio.wav");
		if (typeof language === "string" && language) body.append("language", language);
		return deviceJson<{ text: string }>("/v1/audio/transcriptions", { method: "POST", form: body, slow: true });
	});
	return NextResponse.json({ text: result.text });
});
