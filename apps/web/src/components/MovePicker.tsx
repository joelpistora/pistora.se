"use client";

import { useEffect, useState } from "react";
import { ApiError, isNetworkError, listDir, type FileEntry } from "@/lib/api";

/**
 * Folder picker for "Move to…". Browses directories only; you can't descend into
 * a folder that is itself being moved. Confirms with the currently shown folder.
 */
export default function MovePicker({
  title,
  moving,
  from,
  onPick,
  onClose,
}: {
  title: string;
  /** Names (in `from`) being moved. */
  moving: string[];
  /** Folder they're currently in. */
  from: string;
  onPick: (destDir: string) => void;
  onClose: () => void;
}) {
  const [dir, setDir] = useState(from);
  const [folders, setFolders] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setFolders(null);
    setError(null);
    listDir(dir).then(
      (l) => live && setFolders(l.entries.filter((e) => e.type === "directory")),
      (err: unknown) =>
        live &&
        setError(
          isNetworkError(err) ? "Can't reach the API." : err instanceof ApiError ? err.message : "Couldn't load folder.",
        ),
    );
    return () => {
      live = false;
    };
  }, [dir]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const segs = dir.split("/").filter(Boolean);
  const movingPaths = moving.map((n) => (from ? `${from}/${n}` : n));
  const insideMoved = movingPaths.some((p) => dir === p || dir.startsWith(`${p}/`));
  const same = dir === from;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border border-foreground/15 bg-surface p-5 shadow-xl"
      >
        <h2 className="break-all text-base normal-case">{title}</h2>
        <p className="mt-1 break-all font-mono text-xs text-foreground/60">/{segs.join("/")}</p>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-y border-foreground/10 text-sm">
          {dir !== "" && (
            <button
              type="button"
              onClick={() => setDir(segs.slice(0, -1).join("/"))}
              className="block w-full px-2 py-2 text-left hover:bg-foreground/5"
            >
              ↑ ..
            </button>
          )}
          {error && <p className="p-2 text-red-600">{error}</p>}
          {!folders && !error && <p className="p-2 text-foreground/60">Loading…</p>}
          {folders?.length === 0 && <p className="p-2 text-foreground/60">No subfolders.</p>}
          {folders?.map((f) => {
            const p = dir ? `${dir}/${f.name}` : f.name;
            const blocked = movingPaths.includes(p);
            return (
              <button
                key={f.name}
                type="button"
                disabled={blocked}
                onClick={() => setDir(p)}
                className="block w-full break-all px-2 py-2 text-left hover:bg-foreground/5 disabled:opacity-40"
              >
                📁 {f.name}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end gap-3 text-sm">
          <button type="button" onClick={onClose} className="text-foreground/60 hover:text-foreground">
            Cancel
          </button>
          <button
            type="button"
            disabled={same || insideMoved}
            onClick={() => onPick(dir)}
            className="rounded border border-accent bg-accent px-3 py-1.5 uppercase tracking-wide text-accent-foreground disabled:opacity-40"
          >
            Move here
          </button>
        </div>
      </div>
    </div>
  );
}
