// Where the device is and how to authenticate to it. Shared by the Next.js routes (device.ts) and
// the HTTPS server (server.mjs), so both resolve the device the same way.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function readCliConfig() {
	const file = process.env.TIINY_CONFIG ?? path.join(homedir(), ".local", "tiiny", "config.json");
	try {
		return JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8"));
	} catch {
		return {};
	}
}

/**
@returns {{ baseUrl: string; authKey: string } | null}
*/
export function resolveDeviceTarget() {
	const cli = readCliConfig();
	const address = cli.deviceAddress?.includes(":") ? `[${cli.deviceAddress}]` : cli.deviceAddress;
	const baseUrl = process.env.TIINY_DEVICE_URL ?? (address ? `http://${address}` : undefined);
	const authKey = process.env.TIINY_AUTH_KEY ?? cli.account?.authKey;
	return baseUrl && authKey ? { baseUrl: baseUrl.replace(/\/$/, ""), authKey } : null;
}
