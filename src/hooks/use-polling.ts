import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { paths } from "@/paths";

export interface Polled<T> {
	data: T | null;
	error: string | null;
	isLoading: boolean;
	refresh: () => Promise<void>;
}

// Fetches `url` now and every `intervalMs`, keeping the last good data when a poll fails.
export function usePolling<T>(url: string, intervalMs: number): Polled<T> {
	const [data, setData] = React.useState<T | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [isLoading, setIsLoading] = React.useState<boolean>(true);
	const router = useRouter();
	const { t } = useTranslation();

	const refresh = React.useCallback(async (): Promise<void> => {
		try {
			const response = await fetch(url, { cache: "no-store" });
			if (response.status === 401) {
				router.replace(paths.auth.signIn);
				return;
			}
			const body = (await response.json()) as T & { error?: string };
			if (!response.ok) throw new Error(body.error ?? t("core.errors.requestFailed", { status: response.status }));
			setData(body);
			setError(null);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : String(error_));
		} finally {
			setIsLoading(false);
		}
	}, [url, router, t]);

	React.useEffect(() => {
		const poll = (): void => void refresh();
		poll();
		const timer = setInterval(poll, intervalMs);
		return () => {
			clearInterval(timer);
		};
	}, [refresh, intervalMs]);

	return { data, error, isLoading, refresh };
}
