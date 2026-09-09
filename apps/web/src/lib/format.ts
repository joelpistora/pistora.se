/** Formatting helpers for the file browser. */

const UNITS = ["bytes", "KB", "MB", "GB", "TB"] as const;

/**
 * Human-readable file size. `0` renders as an em dash — the API reports 0 for
 * directories, which have no meaningful size here.
 */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${value} bytes` : `${value.toFixed(1)} ${UNITS[unit]}`;
}

/** Locale date-time for an ISO 8601 string; `"—"` if unparseable. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
