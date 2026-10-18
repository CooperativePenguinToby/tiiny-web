import type { Attachment, ChatMessage } from "@/types/device";

import { DeviceError } from "./device";

// TiinyOS's chat limits.
export const MAX_ATTACHMENTS = 10;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const DOCUMENT_EXTENSIONS = ["doc", "docx", "txt", "csv", "xlsx", "pdf", "html", "md"];

// Media the device stores answers at /api/v1/media/<id>/content on its own (internal) address.
const MEDIA_URL = /^https?:\/\/[\w.-]+(:\d+)?\/api\/v1\/media\/(media_[\da-f]+)\/content$/;

export function parseAttachment(value: unknown): Attachment {
	const item = value as Record<string, unknown>;
	if (item?.kind === "image" && typeof item.url === "string") {
		const match = MEDIA_URL.exec(item.url);
		if (match && match[2] === item.mediaId) {
			return {
				kind: "image",
				mediaId: match[2],
				url: item.url,
				name: typeof item.name === "string" ? item.name : "image",
				mimeType: typeof item.mimeType === "string" ? item.mimeType : "image/*",
			};
		}
	}
	if (item?.kind === "document" && typeof item.name === "string" && typeof item.text === "string") {
		return { kind: "document", name: item.name, text: item.text };
	}
	throw new DeviceError("Invalid attachment", 400);
}

export function parseMessage(value: unknown): ChatMessage {
	const message = value as Record<string, unknown>;
	if ((message?.role !== "user" && message?.role !== "assistant") || typeof message.content !== "string") {
		throw new DeviceError("Expected messages: [{ role, content, attachments? }]", 400);
	}
	const attachments = Array.isArray(message.attachments)
		? message.attachments.map((item) => parseAttachment(item))
		: [];
	if (attachments.length > MAX_ATTACHMENTS) throw new DeviceError(`At most ${MAX_ATTACHMENTS} attachments`, 400);
	return { role: message.role, content: message.content, ...(attachments.length > 0 ? { attachments } : {}) };
}

// The OpenAI-style message the device expects: documents are put in front of the text, images
// become image_url parts.
export function toDeviceMessage({ role, content, attachments = [] }: ChatMessage): {
	role: string;
	content: string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
} {
	const documents = attachments.filter((item) => item.kind === "document");
	const images = attachments.filter((item) => item.kind === "image");
	const text = [...documents.map((item) => `File: ${item.name}\n\n${item.text}`), content].filter(Boolean).join("\n\n");
	if (images.length === 0) return { role, content: text };
	return {
		role,
		content: [
			...images.map((item) => ({ type: "image_url" as const, image_url: { url: item.url } })),
			{ type: "text" as const, text },
		],
	};
}
