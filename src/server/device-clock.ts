import { deviceJson } from "./device";

// The device keeps its own time zone (token usage is counted per day of the device's calendar), which can
// differ from this server's and the browser's. Its UTC offset shows in the timestamps it writes.
// Asked once per process; a failed ask is asked again on the next call.
const cache: { offset: Promise<number> | null } = { offset: null };

async function readDeviceUtcOffsetMinutes(): Promise<number> {
	const context = await deviceJson<{ created_at?: string }>("/kb/user-context", { service: "kb" });
	const match = /([+-])(\d{2}):(\d{2})$/.exec(context.created_at ?? "");
	if (!match) return 0;
	return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

export async function deviceUtcOffsetMinutes(): Promise<number> {
	const offset = (cache.offset ??= readDeviceUtcOffsetMinutes());
	try {
		return await offset;
	} catch (error) {
		if (cache.offset === offset) cache.offset = null;
		throw error;
	}
}

// Monday of the device's current week, as YYYY-MM-DD.
export async function deviceWeekStart(): Promise<string> {
	const offset = await deviceUtcOffsetMinutes();
	const local = new Date(Date.now() + offset * 60_000);
	const monday = new Date(local);
	monday.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
	return monday.toISOString().slice(0, 10);
}
