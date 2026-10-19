import * as React from "react";

import type { HfInspection } from "@/types/device";
import { responseError } from "@/lib/sse";

export type Check =
	{ state: "checking" } | { state: "done"; result: HfInspection } | { state: "error"; message: string };

const CONCURRENCY = 4;

async function inspect(repositoryId: string, signal: AbortSignal): Promise<HfInspection> {
	const response = await fetch("/api/hf/inspect", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ repo: repositoryId, cached: true }),
		signal,
	});
	if (!response.ok) throw new Error(await responseError(response));
	return (await response.json()) as HfInspection;
}

// Asks the device about each repo id, a few at a time, using the server's recent-verdict cache.
// Changing `repositoryIds` or disabling cancels the run; verdicts already received are kept.
export function useDeviceChecks(repositoryIds: string[] | null, isEnabled: boolean): Record<string, Check> {
	const [checks, setChecks] = React.useState<Record<string, Check>>({});
	// The run starts from the latest verdicts without restarting each time one arrives.
	const needsCheck = React.useEffectEvent((id: string): boolean => {
		const known = checks[id];
		return !known || known.state === "checking";
	});
	// `key` stands for `repositoryIds`, so a new array with the same ids does not restart the run. Ids
	// never contain newlines, and an empty key (no ids) starts nothing, as an empty list would.
	const key = repositoryIds?.join("\n") ?? "";

	React.useEffect(() => {
		if (!key || !isEnabled) return;
		const controller = new AbortController();
		const queue = [...new Set(key.split("\n"))].filter((id) => needsCheck(id));
		const worker = async (): Promise<void> => {
			for (let id = queue.shift(); id && !controller.signal.aborted; id = queue.shift()) {
				const repositoryId = id;
				setChecks((current) => ({ ...current, [repositoryId]: { state: "checking" } }));
				try {
					const result = await inspect(repositoryId, controller.signal);
					setChecks((current) => ({ ...current, [repositoryId]: { state: "done", result } }));
				} catch (error) {
					if (controller.signal.aborted) {
						setChecks(({ [repositoryId]: _dropped, ...rest }) => rest);
						return;
					}
					const message = error instanceof Error ? error.message : String(error);
					setChecks((current) => ({ ...current, [repositoryId]: { state: "error", message } }));
				}
			}
		};
		void Promise.all(Array.from({ length: CONCURRENCY }, worker));
		return () => {
			controller.abort();
		};
	}, [key, isEnabled]);

	return checks;
}
