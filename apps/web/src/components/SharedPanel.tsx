"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  deleteShare,
  listSharedDir,
  listShares,
  sharedFileUrl,
  type Share,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import ShareViewer from "./ShareViewer";

export function linkFor(token: string): string {
  return `${window.location.origin}/s/?token=${encodeURIComponent(token)}`;
}

function expiry(s: Share): string {
  return s.expiresAt ? `expires ${formatDate(new Date(s.expiresAt).toISOString())}` : "no expiry";
}

/** "Shared with me" / "Shared by me" tab of the file browser. */
export default function SharedPanel() {
  const [mode, setMode] = useState<"with-me" | "by-me">("with-me");
  const [shares, setShares] = useState<Share[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Share | null>(null);

  const load = useCallback(() => {
    setShares(null);
    setError(null);
    listShares(mode).then(setShares, (e: unknown) =>
      setError(e instanceof ApiError ? e.message : "Couldn't load shares."),
    );
  }, [mode]);
  useEffect(load, [load]);

  const list = useCallback(
    (sub: string) => listSharedDir(open!.id, sub),
    [open],
  );
  const href = useCallback((sub: string) => sharedFileUrl(open!.id, sub), [open]);

  if (open) {
    return (
      <ShareViewer
        name={open.name}
        type={open.type}
        list={list}
        fileHref={href}
        onBack={() => setOpen(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 text-sm">
        {(["with-me", "by-me"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded border px-3 py-1 uppercase tracking-wide ${
              mode === m ? "border-accent text-accent" : "border-foreground/20"
            }`}
          >
            {m === "with-me" ? "Shared with me" : "Shared by me"}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!shares && !error && <p className="text-sm text-foreground/60">Loading…</p>}
      {shares?.length === 0 && (
        <p className="text-sm text-foreground/60">Nothing here yet.</p>
      )}
      <ul className="flex flex-col">
        {shares?.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/10 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="break-all">
                <span aria-hidden>{s.type === "directory" ? "📁 " : "📄 "}</span>
                {mode === "with-me" ? (
                  <button type="button" onClick={() => setOpen(s)} className="text-accent hover:underline">
                    {s.name}
                  </button>
                ) : (
                  s.name
                )}
              </div>
              <div className="text-xs text-foreground/60">
                {mode === "with-me"
                  ? `from ${s.ownerEmail}`
                  : `/${s.path} · ${s.recipientEmail ? `with ${s.recipientEmail}` : "public link"}`}{" "}
                · {expiry(s)}
              </div>
            </div>
            {mode === "by-me" && (
              <div className="flex gap-3">
                {s.token && (
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(linkFor(s.token!))}
                    className="text-accent hover:underline"
                  >
                    Copy link
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void deleteShare(s.id).then(load)}
                  className="text-red-600 hover:underline"
                >
                  Revoke
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
