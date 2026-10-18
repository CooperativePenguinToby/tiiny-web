import { deviceJson } from "./device";

// The device keeps its own time zone (token usage is counted per day of the device's calendar), which can
// differ from this server's and the browser's. Its UTC offset shows in the timestamps it writes.
let offsetPromise: Promise<number> | null = null;

export async function deviceUtcOffsetMinutes(): Promise<number> {
	offsetPromise ??= deviceJson<{ created_at?: string }>("/kb/user-context", { service: "kb" }).then(
		(context) => {
			const match = /([+-])(\d{2}):(\d{2})$/.exec(context.created_at ?? "");
			if (!match) return 0;
			return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
		},
		(error: unknown) => {
			offsetPromise = null;
			throw error;
		}
	);
	return offsetPromise;
}

// Monday of the device's current week, as YYYY-MM-DD.
export async function deviceWeekStart(): Promise<string> {
	const offset = await deviceUtcOffsetMinutes();
	const local = new Date(Date.now() + offset * 60_000);
	const monday = new Date(local);
	monday.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
	return monday.toISOString().slice(0, 10);
}
