import type { ParseKeys, TFunction } from "i18next";

import type { BackupArchive, BackupCategory } from "@/types/device";

import { DeviceError, deviceId, deviceJson, deviceResponse, deviceStream } from "./device";
import { readZip } from "./zip";

// The device's backup service packages each category as tiiny-backup/<service>.zip inside one archive,
// with show_names.json and metadata.json (the device serial); TiinyOS saves it as tiiny.<time>.zip.

const NAMES: Record<string, ParseKeys> = {
	"conversation-service": "server.backup.categories.conversationService",
	"knowledge-base": "server.backup.categories.knowledgeBase",
	"agent-usage": "server.backup.categories.agentUsage",
	"connector-service": "server.backup.categories.connectorService",
	scheduled: "server.backup.categories.scheduled",
	skills: "server.backup.categories.skills",
};

const nameOf = (service: string, t: TFunction): string => (Object.hasOwn(NAMES, service) ? t(NAMES[service]) : service);

interface Discovery {
	ready: boolean;
	estimated_size?: number;
	warnings?: string[];
}

const discover = (): Promise<Record<string, Discovery>> =>
	deviceJson<Record<string, Discovery>>("/v1/backup", { service: "backup" });

export async function backupCategories(t: TFunction): Promise<BackupCategory[]> {
	const services = await discover();
	return Object.entries(services).map(([service, info]) => ({
		service,
		name: nameOf(service, t),
		ready: info.ready,
		sizeBytes: info.estimated_size ?? 0,
		warnings: info.warnings ?? [],
	}));
}

export async function servicesFrom(value: unknown): Promise<string[]> {
	const known = new Set(Object.keys(await discover()));
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		value.some((item) => !(typeof item === "string" && known.has(item)))
	) {
		throw new DeviceError("errors.backup.chooseCategory", 400);
	}
	return value as string[];
}

// The archive and, when some categories could not be backed up, the device's reasons. With failures the
// device answers multipart/mixed (a JSON part and the ZIP).
export async function exportBackup(
	services: string[]
): Promise<{ archive: Buffer; failures: Record<string, unknown> }> {
	const response = await deviceResponse("/v1/backup", {
		method: "POST",
		service: "backup",
		headers: { Accept: "application/zip, multipart/mixed" },
		body: { services },
		stream: true,
	});
	const type = response.headers.get("content-type") ?? "";
	const body = Buffer.from(await response.arrayBuffer());
	if (type.startsWith("application/zip")) return { archive: body, failures: {} };
	const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type);
	if (!boundary || !type.startsWith("multipart/mixed"))
		throw type
			? new DeviceError("errors.backup.unexpectedReply", 502, { type })
			: new DeviceError("errors.backup.unexpectedReplyNoType", 502);
	let archive: Buffer | null = null;
	let failures: Record<string, unknown> = {};
	for (const part of body.toString("latin1").split(`--${boundary[1] ?? boundary[2]}`)) {
		const split = part.indexOf("\r\n\r\n");
		if (split === -1) continue;
		const headers = part.slice(0, split).toLowerCase();
		const content = Buffer.from(part.slice(split + 4).replace(/\r\n$/, ""), "latin1");
		if (headers.includes("application/zip")) archive = content;
		else if (headers.includes("application/json"))
			failures = JSON.parse(content.toString("utf8")) as Record<string, unknown>;
	}
	if (!archive) throw new DeviceError("errors.backup.noArchive", 502);
	return { archive, failures };
}

export async function inspectArchive(archive: Buffer, t: TFunction): Promise<BackupArchive> {
	let entries;
	try {
		entries = readZip(archive);
	} catch {
		throw new DeviceError("errors.backup.notBackup", 400);
	}
	const services = entries.flatMap((entry) => {
		const service = /^tiiny-backup\/([^/\\]+)\.zip$/.exec(entry.name)?.[1];
		return service ? [service] : [];
	});
	if (services.length === 0) throw new DeviceError("errors.backup.notBackup", 400);
	const json = (name: string): Record<string, unknown> | null => {
		const entry = entries.find((item) => item.name === name);
		try {
			return entry ? (JSON.parse(entry.read().toString("utf8")) as Record<string, unknown>) : null;
		} catch {
			return null;
		}
	};
	const names = (json("show_names.json") ?? {}) as Record<string, string>;
	const meta = json("metadata.json");
	const archiveDevice = typeof meta?.device_id === "string" ? meta.device_id : null;
	return {
		categories: services.map((service) => ({ service, name: names[service] ?? nameOf(service, t) })),
		deviceId: archiveDevice,
		sameDevice: archiveDevice === (await deviceId()),
	};
}

// Restores the chosen categories from an archive this device made; streams the device's per-category events.
export async function restoreBackup(
	archive: Buffer,
	services: string[],
	t: TFunction,
	signal: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
	const inspected = await inspectArchive(archive, t);
	if (!inspected.sameDevice) throw new DeviceError("errors.backup.otherDevice", 400);
	const missing = services.filter((service) => inspected.categories.every((category) => category.service !== service));
	if (missing.length > 0) throw new DeviceError("errors.backup.missing", 400, { services: missing.join(", ") });
	const boundary = "tiiny-restore-boundary";
	const body = Buffer.concat([
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="services"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ services })}\r\n--${boundary}\r\nContent-Disposition: form-data; name="archive"; filename="backup.zip"\r\nContent-Type: application/zip\r\n\r\n`
		),
		archive,
		Buffer.from(`\r\n--${boundary}--\r\n`),
	]);
	return deviceStream("/v1/restore/sse", {
		method: "POST",
		service: "backup",
		headers: { Accept: "text/event-stream", "Content-Type": `multipart/mixed; boundary=${boundary}` },
		raw: body,
		signal,
	});
}
