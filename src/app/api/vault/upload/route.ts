import { DeviceError, deviceStream } from "@/server/device";
import { apiRoute, sseResponse } from "@/server/route";
import { kbHeaders, VAULT_EXTENSIONS, VAULT_MAX_FILE_BYTES, VAULT_MAX_FILES } from "@/server/vault";
import { FormData as DeviceForm } from "undici";

// Uploads files (multipart field "files") into Vault and streams the device's progress. Indexing is a
// separate step (/api/vault/index), as in TiinyOS.
export const POST = apiRoute(async (request) => {
	let form: FormData | null = null;
	try {
		form = await request.formData();
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const files = (form?.getAll("files") ?? []).filter((entry): entry is File => entry instanceof File);
	if (files.length === 0) throw new DeviceError("errors.vault.chooseFiles", 400);
	if (files.length > VAULT_MAX_FILES)
		throw new DeviceError("errors.vault.tooManyFiles", 400, { count: VAULT_MAX_FILES });
	for (const file of files) {
		const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
		if (!VAULT_EXTENSIONS.includes(extension)) {
			throw new DeviceError("errors.vault.unsupportedFile", 400, {
				name: file.name,
				extensions: VAULT_EXTENSIONS.join(", "),
			});
		}
		if (file.size > VAULT_MAX_FILE_BYTES)
			throw new DeviceError("errors.file.tooLarge", 400, { name: file.name, megabytes: 200 });
	}
	const body = new DeviceForm();
	for (const file of files) body.append("files", file, file.name);
	body.append("timestamp", new Date().toISOString());
	body.append("finalize_now", "false");
	body.append("source_id", `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
	return sseResponse(
		await deviceStream("/kb/upload/stream", {
			method: "POST",
			service: "kb",
			headers: { ...(await kbHeaders()), Accept: "text/event-stream" },
			form: body,
			signal: request.signal,
		})
	);
});
