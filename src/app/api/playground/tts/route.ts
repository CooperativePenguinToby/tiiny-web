import { deviceResponse } from "@/server/device";
import { withModel } from "@/server/models";
import { modelIdOf, textOf } from "@/server/playground";
import { apiRoute } from "@/server/route";

// { model, text, voice? } → the spoken audio as WAV (the device also offers MP3, but its own speech
// recognition cannot read MP3 back).
export const POST = apiRoute(async (request) => {
	let body: { model?: unknown; text?: unknown; voice?: unknown } = {};
	try {
		body = (await request.json()) as { model?: unknown; text?: unknown; voice?: unknown };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const model = modelIdOf(body.model);
	const text = textOf(body.text, { kind: "text" }, 4000);
	const audio = await withModel(model, () =>
		deviceResponse("/v1/audio/speech", {
			method: "POST",
			body: {
				model,
				input: text,
				response_format: "wav",
				...(typeof body.voice === "string" && body.voice && { voice: body.voice }),
			},
			stream: true,
		})
	);
	return new Response(audio.body, { headers: { "Content-Type": audio.headers.get("content-type") ?? "audio/wav" } });
});
