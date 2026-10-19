import { readSse } from "@/lib/sse";

import { DeviceError, deviceJson, deviceStream, modelPath } from "./device";

// Reads `{ modelId }` from a request body; model ids look like `Org/Name`.
export async function modelIdFrom(request: Request): Promise<string> {
	let body: { modelId?: unknown };
	try {
		body = (await request.json()) as { modelId?: unknown };
	} catch {
		body = {};
	}
	const { modelId } = body;
	if (typeof modelId !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(modelId)) {
		throw new DeviceError("modelId must look like Org/Name", 400);
	}
	return modelId;
}

async function isModelRunning(modelId: string): Promise<boolean> {
	const running = await deviceJson<{ running: string[] }>("/api/v1/models/running");
	return running.running.includes(modelId);
}

// Loads a model and waits until it runs (the device answers inference only for loaded models). Fails with
// the device's reason, e.g. when the NPU has no room.
async function loadModel(modelId: string): Promise<void> {
	const stream = await deviceStream(`/api/v1/models/${modelPath(modelId)}/launch/stream`, { method: "POST" });
	let last: {
		status?: string;
		startup_error?: string;
		error?: string;
		toast?: { message?: string };
		success?: boolean;
	} = {};
	const events = readSse(new Response(stream));
	for await (const { data } of events) {
		last = JSON.parse(data) as typeof last;
		if (last.startup_error || last.status === "failed" || last.success === false) {
			throw new DeviceError(last.startup_error || last.toast?.message || last.error || "The model did not load", 502);
		}
	}
	if (last.status !== "running") throw new DeviceError(`The model did not load (${last.status ?? "no status"})`, 502);
}

// For a few seconds after the device reports a model as running, its server answers "The upstream model
// server failed". Runs the model on `modelId`, loading it if needed and retrying through that warm-up.
export async function withModel<T>(modelId: string, run: () => Promise<T>): Promise<T> {
	const requiresLoad = !(await isModelRunning(modelId));
	if (requiresLoad) await loadModel(modelId);
	const deadline = Date.now() + 60_000;
	for (;;) {
		try {
			return await run();
		} catch (error) {
			const isWarming = error instanceof DeviceError && /upstream model server failed/i.test(error.message);
			if (!requiresLoad || !isWarming || Date.now() > deadline) throw error;
			await new Promise((resolve) => setTimeout(resolve, 3000));
		}
	}
}
