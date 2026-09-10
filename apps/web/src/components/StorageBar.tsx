"use client";

import { useEffect, useState } from "react";
import { getUsage, isNetworkError, type UsageResponse } from "@/lib/api";
import { formatSize } from "@/lib/format";

/** `formatSize` renders 0 as an em dash (for directories); the meter wants "0 bytes". */
const bytes = (n: number) => (n <= 0 ? "0 bytes" : formatSize(n));

/**
 * The quota meter shown above the file list for regular users. Re-fetches
 * whenever `refreshKey` changes (bump it after an upload/delete). Renders
 * nothing for admins (`quotaBytes: null`) or until the first fetch resolves.
 */
export default function StorageBar({ refreshKey = 0 }: { refreshKey?: number }) {
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getUsage({ signal: controller.signal })
      .then((u) => {
        setUsage(u);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(isNetworkError(err) ? "Couldn't load storage usage." : null);
      });
    return () => controller.abort();
  }, [refreshKey]);

  if (error) {
    return <p className="text-xs text-foreground/50">{error}</p>;
  }
  if (!usage || usage.quotaBytes == null) return null;

  const { usedBytes, quotaBytes } = usage;
  const pct = quotaBytes === 0 ? 100 : Math.min(100, (usedBytes / quotaBytes) * 100);
  const full = usedBytes >= quotaBytes;
  const near = pct >= 80;
  const barColor = full ? "bg-red-500" : near ? "bg-amber-500" : "bg-foreground/70";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs text-foreground/60">
        <span>
          {bytes(usedBytes)} of {bytes(quotaBytes)} used
        </span>
        <span>{bytes(Math.max(0, quotaBytes - usedBytes))} free</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {full && (
        <p className="text-xs text-red-600">
          Your storage is full — delete files or ask an admin to raise your limit.
        </p>
      )}
    </div>
  );
}
