import { NextResponse } from "next/server";
import { DOCUMENT_EXTENSIONS, MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES } from "@/server/chat";
import { DeviceError, deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";
import { FormData as DeviceForm } from "undici";

import type { Attachment } from "@/types/device";

interface Media {
	id: string;
	url: string;
	filename: string;
	mime_type: string;
}
interface Parsed {
	data?: { content?: string };
	content?: string;
	base_response?: { code?: number; msg?: string };
}

// POST multipart "file": an image is stored in the device's media store, a document is turned into text
// by the device. Returns the Attachment to send with a message.
export const POST = apiRoute(async (request) => {
	let form: FormData | null = null;
	try {
		form = await request.formData();
	} catch {
		// A missing or malformed body is handled like an empty one.
	}
	const file = form?.get("file");
	if (!(file instanceof File)) throw new DeviceError("errors.chat.chooseFile", 400);
	const body = new DeviceForm();
	body.append("file", file, file.name);

	if (file.type.startsWith("image/")) {
		if (file.size > MAX_IMAGE_BYTES)
			throw new DeviceError("errors.file.tooLarge", 400, { name: file.name, megabytes: 50 });
		const media = await deviceJson<Media>("/api/v1/media/upload", {
			method: "POST",
			service: "media",
			form: body,
			slow: true,
		});
		const attachment: Attachment = {
			kind: "image",
			mediaId: media.id,
			url: media.url,
			name: media.filename,
			mimeType: media.mime_type,
		};
		return NextResponse.json(attachment);
	}

	const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
	if (!DOCUMENT_EXTENSIONS.includes(extension)) {
		throw new DeviceError("errors.chat.unsupportedFile", 400, {
			name: file.name,
			extensions: DOCUMENT_EXTENSIONS.join(", "),
		});
	}
	if (file.size > MAX_DOCUMENT_BYTES)
		throw new DeviceError("errors.file.tooLarge", 400, { name: file.name, megabytes: 10 });
	body.append("filename", file.name);
	const parsed = await deviceJson<Parsed>("/api/v1/file/upload_file", { method: "POST", form: body, slow: true });
	// Current firmware returns the text in base_response.msg; TiinyOS also reads data.content and content.
	const text = parsed.data?.content ?? parsed.content ?? parsed.base_response?.msg ?? "";
	if (!text.trim()) throw new DeviceError("errors.chat.noText", 422, { name: file.name });
	const attachment: Attachment = { kind: "document", name: file.name, text };
	return NextResponse.json(attachment);
});
