import { DeviceError } from "./device";

// Reads `{ modelId }` from a request body; model ids look like `Org/Name`.
export async function modelIdFrom(request: Request): Promise<string> {
	const { modelId } = (await request.json().catch(() => ({}))) as { modelId?: unknown };
	if (typeof modelId !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(modelId)) {
		throw new DeviceError("modelId must look like Org/Name", 400);
	}
	return modelId;
}
