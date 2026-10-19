import { APP_ID } from "@/server/app-identity";
import { DeviceError, deviceStream } from "@/server/device";
import { apiRoute, sseResponse } from "@/server/route";

import { IMAGE_SIZES } from "@/types/device";

// Generates an image with a loaded text-to-image model and streams the device's events; the last one
// carries the picture (base64).
export const POST = apiRoute(async (request) => {
	let input: Record<string, unknown> = {};
	try {
		input = (await request.json()) as Record<string, unknown>;
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const { modelId, prompt, size, steps, seed } = input;
	if (typeof modelId !== "string" || typeof prompt !== "string" || !prompt.trim()) {
		throw new DeviceError("Expected { modelId, prompt }", 400);
	}
	if (typeof size !== "string" || !(IMAGE_SIZES as readonly string[]).includes(size)) {
		throw new DeviceError(`size must be one of ${IMAGE_SIZES.join(", ")}`, 400);
	}
	if (!Number.isSafeInteger(steps) || (steps as number) < 1 || (steps as number) > 50) {
		throw new DeviceError("steps must be 1-50", 400);
	}
	const [width, height] = size.split("x").map(Number);
	const body = {
		model: modelId,
		prompt: prompt.trim(),
		negative_prompt: "",
		width,
		height,
		// eslint-disable-next-line unicorn/prefer-number-is-safe-integer -- any integer seed is passed to the device unchanged; isSafeInteger would replace seeds above 2^53 with a random one
		seed: Number.isInteger(seed) ? seed : Math.floor(Math.random() * 2 ** 31),
		steps,
		sampling_method: "DPM++ 2M",
		batch_size: 1,
		priority: 20,
		app_id: APP_ID,
	};
	return sseResponse(await deviceStream("/v1/image/generate/stream", { method: "POST", body, signal: request.signal }));
});
