import { inflateRawSync } from "node:zlib";

// Just enough of the ZIP format to list a backup archive's entries and read its small JSON files.

// Record signatures, written in decimal so the formatter and the linter agree.
const END_OF_DIRECTORY = 101_010_256; // "PK\5\6"
const DIRECTORY_ENTRY = 33_639_248; // "PK\1\2"

export interface ZipEntry {
	name: string;
	read: () => Buffer;
}

export function readZip(archive: Buffer): ZipEntry[] {
	// The end-of-directory record sits within the last 64 KiB + 22 bytes.
	let end = -1;
	for (let at = archive.length - 22; at >= Math.max(0, archive.length - 65_557); at -= 1) {
		if (archive.readUInt32LE(at) === END_OF_DIRECTORY) {
			end = at;
			break;
		}
	}
	if (end === -1) throw new Error("Not a ZIP file");
	const count = archive.readUInt16LE(end + 10);
	let at = archive.readUInt32LE(end + 16);
	const entries: ZipEntry[] = [];
	for (let index = 0; index < count; index += 1) {
		if (archive.readUInt32LE(at) !== DIRECTORY_ENTRY) throw new Error("Damaged ZIP directory");
		const method = archive.readUInt16LE(at + 10);
		const compressed = archive.readUInt32LE(at + 20);
		const nameLength = archive.readUInt16LE(at + 28);
		const extraLength = archive.readUInt16LE(at + 30);
		const commentLength = archive.readUInt16LE(at + 32);
		const local = archive.readUInt32LE(at + 42);
		const name = archive.toString("utf8", at + 46, at + 46 + nameLength);
		entries.push({
			name,
			read: () => {
				const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
				const data = archive.subarray(start, start + compressed);
				if (method === 0) return data;
				if (method === 8) return inflateRawSync(data);
				throw new Error(`Unsupported ZIP compression ${method}`);
			},
		});
		at += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}
