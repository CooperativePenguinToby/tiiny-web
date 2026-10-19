import type { Personalization } from "@/types/device";

import { DeviceError, deviceJson } from "./device";

// Field limits TiinyOS enforces.
export const PERSONALIZATION_LIMITS: Record<keyof Personalization, number> = {
	userName: 30,
	occupation: 50,
	preferences: 1000,
	recentFocus: 1000,
};

interface UserContext {
	profile?: { user_name?: string; occupation?: string; preferences?: string; more_about_you?: string };
	markdown?: string;
}

export async function readUserContext(): Promise<{ profile: Personalization; markdown: string }> {
	const context = await deviceJson<UserContext>("/kb/user-context", { service: "kb" });
	const profile = context.profile ?? {};
	return {
		profile: {
			userName: profile.user_name ?? "",
			occupation: profile.occupation ?? "",
			preferences: profile.preferences ?? "",
			recentFocus: profile.more_about_you ?? "",
		},
		markdown: context.markdown ?? "",
	};
}

export function parsePersonalization(body: unknown): Personalization {
	const value = body as Partial<Record<keyof Personalization, unknown>>;
	const result = {} as Personalization;
	for (const [field, limit] of Object.entries(PERSONALIZATION_LIMITS) as [keyof Personalization, number][]) {
		const text = value[field];
		if (typeof text !== "string") throw new DeviceError("errors.request.mustBeText", 400, { field });
		if (text.length > limit) throw new DeviceError("errors.request.tooLong", 400, { field, count: limit });
		result[field] = text.trim();
	}
	return result;
}

// The device replaces the whole profile on each write.
export async function writePersonalization(profile: Personalization): Promise<void> {
	await deviceJson("/kb/user-context/profile", {
		method: "PUT",
		service: "kb",
		body: {
			user_name: profile.userName,
			occupation: profile.occupation,
			preferences: profile.preferences,
			more_about_you: profile.recentFocus,
		},
	});
}
