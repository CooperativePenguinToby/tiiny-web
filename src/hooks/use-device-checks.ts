import * as React from "react";

import type { HfInspection } from "@/types/device";
import { responseError } from "@/lib/sse";

export type Check =
	{ state: "checking" } | { state: "done"; result: HfInspection } | { state: "error"; message: string };

const CONCURRENCY = 4;

async function inspect(repoId: string, signal: AbortSignal): Promise<HfInspection> {
	const response = await fetch("/api/hf/inspect", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ repo: repoId, cached: true }),
		signal,
	});
	if (!response.ok) throw new Error(await responseError(response));
	return (await response.json()) as HfInspection;
}

// Asks the device about each repo id, a few at a time, using the server's recent-verdict cache.
// Changing `repoIds` or disabling cancels the run; verdicts already received are kept.
export function useDeviceChecks(repoIds: string[] | null, enabled: boolean): Record<string, Check> {
	const [checks, setChecks] = React.useState<Record<string, Check>>({});
	const checksRef = React.useRef(checks);
	checksRef.current = checks;
	const key = repoIds?.join("\n") ?? "";

	React.useEffect(() => {
		if (!repoIds || !enabled) return;
		const controller = new AbortController();
		const queue = [...new Set(repoIds)].filter((id) => {
			const known = checksRef.current[id];
			return !known || known.state === "checking";
		});
		const worker = async (): Promise<void> => {
			for (let id = queue.shift(); id && !controller.signal.aborted; id = queue.shift()) {
				const repoId = id;
				setChecks((current) => ({ ...current, [repoId]: { state: "checking" } }));
				try {
					const result = await inspect(repoId, controller.signal);
					setChecks((current) => ({ ...current, [repoId]: { state: "done", result } }));
				} catch (error) {
					if (controller.signal.aborted) {
						setChecks(({ [repoId]: _dropped, ...rest }) => rest);
						return;
					}
					const message = error instanceof Error ? error.message : String(error);
					setChecks((current) => ({ ...current, [repoId]: { state: "error", message } }));
				}
			}
		};
		void Promise.all(Array.from({ length: CONCURRENCY }, worker));
		return () => {
			controller.abort();
		};
		// `key` stands for `repoIds`; re-running on each received verdict would restart the queue.
		// eslint-disable-next-line react-hooks/exhaustive-deps -- see above
	}, [key, enabled]);

	return checks;
}
