import { DeviceError } from "./device";

// Reads `{ <field>: "<id>" }` from a request body; service and app ids are short slugs.
export async function agentIdFrom(request: Request, field: "serviceId" | "appId"): Promise<string> {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		body = {};
	}
	const value = body[field];
	if (typeof value !== "string" || !/^[\w.-]{1,128}$/.test(value))
		throw new DeviceError("errors.request.required", 400, { field });
	return value;
}
