"use client";

import { useEffect, useState } from "react";
import { ApiError, isNetworkError, statEntry, type FileMetadata } from "@/lib/api";
import { formatDate, formatSize } from "@/lib/format";

/**
 * A small modal showing an entry's metadata (`GET /api/files/<path>?stat=1`):
 * type, full path, exact size, and timestamps. Closes on backdrop click or
 * Escape.
 */
export default function FileProperties({
  path,
  name,
  onClose,
}: {
  path: string;
  name: string;
  onClose: () => void;
}) {
  const [meta, setMeta] = useState<FileMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setMeta(null);
    setError(null);
    statEntry(path)
      .then((m) => {
        if (live) setMeta(m);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(
          isNetworkError(err)
            ? "Can't reach the API."
            : err instanceof ApiError
              ? err.message
              : "Couldn't load details.",
        );
      });
    return () => {
      live = false;
    };
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Properties of ${name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-foreground/15 bg-background p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold break-all">{name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-foreground/50 hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {!error && !meta && (
          <p className="mt-4 text-sm text-foreground/60">Loading…</p>
        )}
        {meta && (
          <dl className="mt-4 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-foreground/50">Type</dt>
            <dd>{meta.type === "directory" ? "Folder" : "File"}</dd>

            <dt className="text-foreground/50">Path</dt>
            <dd className="break-all font-mono text-xs">/{meta.path}</dd>

            {meta.type === "file" && (
              <>
                <dt className="text-foreground/50">Size</dt>
                <dd>
                  {formatSize(meta.size)}
                  {meta.size >= 1024 && (
                    <span className="text-foreground/50">
                      {" "}
                      ({meta.size.toLocaleString()} bytes)
                    </span>
                  )}
                </dd>
              </>
            )}

            <dt className="text-foreground/50">Modified</dt>
            <dd>{formatDate(meta.modifiedAt)}</dd>

            <dt className="text-foreground/50">Created</dt>
            <dd>{formatDate(meta.createdAt)}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}
