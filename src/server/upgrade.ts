import type { SystemUpdate } from "@/types/device";

import { deviceJson } from "./device";

interface UpgradeReply {
	data: {
		current_version: string;
		available_version: string;
		update_available: boolean;
		required: boolean;
		description: string;
		state_machine?: {
			global_status?: { current_status?: string };
			overall_progress?: number;
			error_message?: string;
		};
	};
}

function toUpdate({ data }: UpgradeReply): SystemUpdate {
	const machine = data.state_machine;
	return {
		currentVersion: data.current_version,
		availableVersion: data.available_version,
		updateAvailable: data.update_available,
		required: data.required,
		notes: data.description,
		state: (machine?.global_status?.current_status ?? "idle").toLowerCase(),
		progress: machine?.overall_progress ?? 0,
		error: machine?.error_message || null,
	};
}

// Asks the device's upgrade service whether a newer TiinyOS is available (it checks with Tiiny's servers).
export async function checkForUpdate(): Promise<SystemUpdate> {
	return toUpdate(
		await deviceJson<UpgradeReply>("/api/upgrade/check", { method: "POST", service: "upgrade", slow: true })
	);
}

export async function updateStatus(): Promise<SystemUpdate> {
	return toUpdate(await deviceJson<UpgradeReply>("/api/upgrade/status/v2", { service: "upgrade" }));
}

// Downloads and stages `version`; once the state is "prepared", install() applies it and the device restarts.
export async function prepareUpdate(version: string): Promise<void> {
	await deviceJson(`/api/upgrade/download_and_ota_prepare?target_version=${encodeURIComponent(version)}`, {
		method: "POST",
		service: "upgrade",
		slow: true,
	});
}

export async function installUpdate(): Promise<void> {
	await deviceJson("/api/upgrade/upgrade_to?target_version=prepared", {
		method: "POST",
		service: "upgrade",
		slow: true,
	});
}
