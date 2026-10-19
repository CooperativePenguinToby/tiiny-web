import { getI18n } from "react-i18next";

export interface SseEvent {
	event: string;
	data: string;
}

// Parses a text/event-stream response body into events as they arrive.
export async function* readSse(response: Response): AsyncGenerator<SseEvent> {
	if (!response.body) return;
	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = "";
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += value.replaceAll("\r\n", "\n");
		let boundary = buffer.indexOf("\n\n");
		while (boundary !== -1) {
			const block = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			boundary = buffer.indexOf("\n\n");
			let event = "message";
			const data: string[] = [];
			for (const line of block.split("\n")) {
				if (line.startsWith("event:")) event = line.slice(6).trim();
				else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
			}
			if (data.length > 0) yield { event, data: data.join("\n") };
		}
	}
}

// Error message from a non-OK API response (`{ error }` JSON) or a fallback. Runs in the browser, where
// getI18n() is the I18nProvider's instance (the routes' `{ error }` is already in the request's language).
export async function responseError(response: Response): Promise<string> {
	let body: { error?: string } = {};
	try {
		body = (await response.json()) as { error?: string };
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	return body.error ?? getI18n().t("core.errors.requestFailed", { status: response.status });
}
