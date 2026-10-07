/**
 * Byte and ratio formatting.
 *
 * Uses decimal units (KB = 1000 B) because that is what every operating system
 * file listing and every image CDN reports. Showing 1 MB here and 976 KB in
 * Finder for the same file erodes trust in the numbers.
 */
const UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatBytes(bytes: number, decimals?: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";

  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }

  // Bytes are always whole; larger units get one decimal until they reach three
  // significant digits, which keeps column widths stable in the file list.
  const places = decimals ?? (unit === 0 ? 0 : value >= 100 ? 0 : 1);
  return `${value.toFixed(places)} ${UNITS[unit]}`;
}

/** Parses "500", "500kb", "1.2 MB" into bytes. Returns null if unparseable. */
export function parseBytes(input: string): number | null {
  const match = /^\s*([\d.]+)\s*(b|kb|mb|gb)?\s*$/i.exec(input);
  if (!match) return null;
  const value = Number.parseFloat(match[1]!);
  if (!Number.isFinite(value) || value <= 0) return null;
  const scale = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9 }[
    (match[2] ?? "kb").toLowerCase() as "b" | "kb" | "mb" | "gb"
  ];
  return Math.round(value * scale);
}

/** Savings as a positive percentage. Negative when the output grew. */
export function savingsPercent(originalBytes: number, outputBytes: number): number {
  if (originalBytes <= 0) return 0;
  return ((originalBytes - outputBytes) / originalBytes) * 100;
}

export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

export function formatDimensions(width: number, height: number): string {
  return `${width} x ${height}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
