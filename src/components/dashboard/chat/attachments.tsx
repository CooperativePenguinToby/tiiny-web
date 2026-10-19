"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { FileTextIcon } from "@phosphor-icons/react/dist/ssr/FileText";
import { useTranslation } from "react-i18next";

import type { Attachment } from "@/types/device";
import { responseError } from "@/lib/sse";
import { useFormat } from "@/i18n/client";

export const DOCUMENT_ACCEPT = ".doc,.docx,.txt,.csv,.xlsx,.pdf,.html,.md";

const thumbnail = (attachment: Extract<Attachment, { kind: "image" }>): string =>
	`/api/chat/media/${encodeURIComponent(attachment.mediaId)}`;

// React keys for a list of attachments: images by their media id, documents by name (they have no id),
// numbered when the same one appears more than once.
const attachmentKeys = (attachments: Attachment[]): string[] => {
	const seen = new Map<string, number>();
	return attachments.map((attachment) => {
		const base = attachment.kind === "image" ? `image-${attachment.mediaId}` : `document-${attachment.name}`;
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		return count === 0 ? base : `${base}-${count + 1}`;
	});
};

// Files attached to the message being written: uploaded (images) or read by the device (documents) as
// soon as they are picked.
export function useAttachments(): {
	attachments: Attachment[];
	uploading: string[];
	error: string | null;
	add: (files: File[]) => Promise<void>;
	remove: (index: number) => void;
	clear: () => void;
} {
	const [attachments, setAttachments] = React.useState<Attachment[]>([]);
	const [uploading, setUploading] = React.useState<string[]>([]);
	const [error, setError] = React.useState<string | null>(null);

	const add = async (files: File[]): Promise<void> => {
		setError(null);
		setUploading((current) => [...current, ...files.map((file) => file.name)]);
		await Promise.all(
			files.map(async (file) => {
				try {
					const form = new FormData();
					form.append("file", file);
					const response = await fetch("/api/chat/attachments", { method: "POST", body: form });
					if (!response.ok) throw new Error(await responseError(response));
					const attachment = (await response.json()) as Attachment;
					setAttachments((current) => [...current, attachment]);
				} catch (error_) {
					setError(error_ instanceof Error ? error_.message : String(error_));
				} finally {
					setUploading((current) => current.filter((name) => name !== file.name));
				}
			})
		);
	};

	return {
		attachments,
		uploading,
		error,
		add,
		remove: (index) => setAttachments((current) => current.filter((_item, at) => at !== index)),
		clear: () => setAttachments([]),
	};
}

export function AttachmentChips({
	attachments,
	uploading,
	onRemove,
}: {
	attachments: Attachment[];
	uploading: string[];
	onRemove?: (index: number) => void;
}): React.JSX.Element | null {
	const { t } = useTranslation();
	const format = useFormat();
	if (attachments.length === 0 && uploading.length === 0) return null;
	const keys = attachmentKeys(attachments);
	return (
		<Stack data-testid="attachments" direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
			{attachments.map((attachment, index) =>
				attachment.kind === "image" ? (
					<Chip
						avatar={<Box alt="" component="img" src={thumbnail(attachment)} sx={{ objectFit: "cover" }} />}
						key={keys[index]}
						label={attachment.name}
						onDelete={onRemove ? () => onRemove(index) : undefined}
						variant="outlined"
					/>
				) : (
					<Chip
						icon={<FileTextIcon />}
						key={keys[index]}
						label={attachment.name}
						onDelete={onRemove ? () => onRemove(index) : undefined}
						title={t("chat.attachments.charactersRead", {
							count: attachment.text.length,
							characters: format.number(attachment.text.length),
						})}
						variant="outlined"
					/>
				)
			)}
			{uploading.map((name) => (
				<Chip key={`uploading-${name}`} label={t("chat.attachments.uploading", { name })} variant="outlined" />
			))}
		</Stack>
	);
}

// Attachments shown in a message: images as pictures (with a download link), documents by name.
export function MessageAttachments({
	attachments,
	align,
}: {
	attachments: Attachment[];
	align: "start" | "end";
}): React.JSX.Element {
	const { t } = useTranslation();
	const images = attachments.filter((item) => item.kind === "image");
	const documents = attachments.filter((item) => item.kind === "document");
	return (
		<Stack spacing={1} sx={{ mb: 1, alignItems: align === "end" ? "flex-end" : "flex-start" }}>
			{images.map((image) => (
				<Stack key={image.mediaId} spacing={0.5} sx={{ alignItems: "inherit" }}>
					<Box
						alt={image.name}
						component="img"
						onError={(event: React.SyntheticEvent<HTMLImageElement>) => {
							event.currentTarget.alt = t("chat.attachments.missing", { name: image.name });
						}}
						src={thumbnail(image)}
						sx={{
							maxWidth: align === "end" ? 240 : 512,
							maxHeight: align === "end" ? 240 : 512,
							borderRadius: 2,
							objectFit: "contain",
						}}
					/>
					<Link download={image.name} href={thumbnail(image)} variant="caption">
						{t("chat.attachments.download")}
					</Link>
				</Stack>
			))}
			{documents.length > 0 ? <AttachmentChips attachments={documents} uploading={[]} /> : null}
		</Stack>
	);
}
