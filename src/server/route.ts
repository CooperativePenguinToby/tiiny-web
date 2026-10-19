import { NextResponse } from "next/server";

import { getT } from "@/i18n/server";

import { DeviceError } from "./device";
import { hasSession } from "./session";

// Wraps an API route handler: rejects requests without a session and turns failures into
// `{ error }` JSON, in the request's language, so the UI can show the device's own message.
export function apiRoute<A extends unknown[]>(
	handler: (request: Request, ...arguments_: A) => Promise<Response>
): (request: Request, ...arguments_: A) => Promise<Response> {
	return async (request, ...arguments_) => {
		const t = await getT();
		if (!(await hasSession())) return NextResponse.json({ error: t("errors.notSignedIn") }, { status: 401 });
		try {
			return await handler(request, ...arguments_);
		} catch (error) {
			if (error instanceof DeviceError) {
				return NextResponse.json({ error: t(error.key, error.values) }, { status: error.status });
			}
			console.error(error);
			return NextResponse.json({ error: t("errors.internal") }, { status: 500 });
		}
	};
}

export const sseResponse = (stream: ReadableStream<Uint8Array>): Response =>
	new Response(stream, {
		headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
	});
