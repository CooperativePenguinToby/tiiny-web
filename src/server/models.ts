import { readSse } from "@/lib/sse";

import { DeviceError, deviceJson, deviceStream, modelPath } from "./device";

// Reads `{ modelId }` from a request body; model ids look like `Org/Name`.
export async function modelIdFrom(request: Request): Promise<string> {
	const { modelId } = (await request.json().catch(() => ({}))) as { modelId?: unknown };
	if (typeof modelId !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(modelId)) {
		throw new DeviceError("modelId must look like Org/Name", 400);
	}
	return modelId;
}

// Loads a model if it is not loaded yet and waits until it runs (the device answers inference only for
// loaded models). Fails with the device's reason, e.g. when the NPU has no room. Resolves true if it had
// to load the model.
export async function ensureRunning(modelId: string): Promise<boolean> {
	const running = await deviceJson<{ running: string[] }>("/api/v1/models/running");
	if (running.running.includes(modelId)) return false;
	const stream = await deviceStream(`/api/v1/models/${modelPath(modelId)}/launch/stream`, { method: "POST" });
	let last: {
		status?: string;
		startup_error?: string;
		error?: string;
		toast?: { message?: string };
		success?: boolean;
	} = {};
	for await (const { data } of readSse(new Response(stream))) {
		last = JSON.parse(data) as typeof last;
		if (last.startup_error || last.status === "failed" || last.success === false) {
			throw new DeviceError(last.startup_error || last.toast?.message || last.error || "The model did not load", 502);
		}
	}
	if (last.status !== "running") throw new DeviceError(`The model did not load (${last.status ?? "no status"})`, 502);
	return true;
}

// For a few seconds after the device reports a model as running, its server answers "The upstream model
// server failed". Runs the model on `modelId`, loading it if needed and retrying through that warm-up.
export async function withModel<T>(modelId: string, run: () => Promise<T>): Promise<T> {
	const loadedNow = await ensureRunning(modelId);
	const deadline = Date.now() + 60_000;
	for (;;) {
		try {
			return await run();
		} catch (error) {
			const warming = error instanceof DeviceError && /upstream model server failed/i.test(error.message);
			if (!loadedNow || !warming || Date.now() > deadline) throw error;
			await new Promise((resolve) => setTimeout(resolve, 3000));
		}
	}
}
