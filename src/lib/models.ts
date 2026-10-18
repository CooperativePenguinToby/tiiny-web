import type { LaunchEvent } from "@/types/device";

import { readSse, responseError } from "./sse";

// Loads a model through this app's API, reporting the device's progress, until it is running.
export async function loadModel(
	modelId: string,
	onProgress: (message: string, progress: number | null) => void
): Promise<void> {
	const response = await fetch("/api/models/load", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ modelId }),
	});
	if (!response.ok) throw new Error(await responseError(response));
	for await (const { event, data } of readSse(response)) {
		const update = JSON.parse(data) as LaunchEvent;
		if (event === "error" || update.startup_error || update.status === "failed" || update.status === "error") {
			throw new Error(update.startup_error || update.result?.message || `Device reported ${update.status ?? event}`);
		}
		const progress = update.progress ?? update.result?.progress ?? null;
		onProgress(update.startup_message || update.result?.message || update.status || event, progress);
		if (update.status === "running" && progress === 100) return;
	}
}
