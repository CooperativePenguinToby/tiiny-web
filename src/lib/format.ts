const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(unit === 0 ? 0 : 1)} ${UNITS[unit]}`;
}

export const percent = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

// 15075773 → "15.1M"; small counts stay exact.
export const formatCount = (value: number): string => compact.format(value);
