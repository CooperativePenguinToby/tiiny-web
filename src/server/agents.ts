import { DeviceError } from "./device";

// Reads `{ <field>: "<id>" }` from a request body; service and app ids are short slugs.
export async function agentIdFrom(request: Request, field: "serviceId" | "appId"): Promise<string> {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const value = body[field];
	if (typeof value !== "string" || !/^[\w.-]{1,128}$/.test(value)) throw new DeviceError(`${field} is required`, 400);
	return value;
}
