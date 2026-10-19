const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number, language = "en"): string {
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit += 1;
	}
	const digits = unit === 0 ? 0 : 1;
	return `${value.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${UNITS[unit]}`;
}

export const percent = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);

// 15075773 → "15.1M"; small counts stay exact.
export const formatCount = (value: number, language = "en"): string =>
	new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 1 }).format(value);
