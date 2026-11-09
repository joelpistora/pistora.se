"use client";

import type { UploadItem } from "@/hooks/useUploads";
import { formatSize } from "@/lib/format";

/** Progress list for the upload queue: one row per file, with cancel. */
export default function UploadPanel({
  items,
  onCancel,
  onClear,
}: {
  items: UploadItem[];
  onCancel: (id: number) => void;
  onClear: () => void;
}) {
  if (items.length === 0) return null;
  const active = items.some((i) => i.status === "queued" || i.status === "uploading");

  return (
    <div className="rounded border border-foreground/15 bg-surface p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="uppercase tracking-wide text-foreground/60">Uploads</span>
        {!active && (
          <button type="button" onClick={onClear} className="text-foreground/50 hover:text-foreground">
            Clear
          </button>
        )}
      </div>
      <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto">
        {items.map((i) => {
          const pct = i.total > 0 ? Math.round((i.loaded / i.total) * 100) : i.status === "done" ? 100 : 0;
          return (
            <li key={i.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 break-all">{i.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-foreground/60">
                  {i.status === "uploading" && `${pct}% of ${formatSize(i.total)}`}
                  {i.status === "queued" && "waiting"}
                  {i.status === "done" && "done"}
                  {i.status === "cancelled" && "cancelled"}
                  {i.status === "error" && <span className="text-red-600">{i.error}</span>}
                  {(i.status === "queued" || i.status === "uploading") && (
                    <button type="button" onClick={() => onCancel(i.id)} aria-label={`Cancel ${i.name}`} className="hover:text-foreground">
                      ✕
                    </button>
                  )}
                </span>
              </div>
              {i.status === "uploading" && (
                <div className="mt-1 h-1 overflow-hidden rounded bg-foreground/10">
                  <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
