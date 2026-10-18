import { responseError } from "./sse";

// POSTs JSON to one of this app's API routes and returns the parsed reply, throwing the route's error.
export async function postJson<T = unknown>(url: string, body: unknown = {}): Promise<T> {
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) throw new Error(await responseError(response));
	return (await response.json()) as T;
}
