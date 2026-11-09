"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  createShare,
  deleteShare,
  isNetworkError,
  listShares,
  type Share,
} from "@/lib/api";
import { linkFor } from "./SharedPanel";

const EXPIRY_OPTIONS = [
  { label: "Never expires", days: 0 },
  { label: "1 day", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

/** Modal opened from a row's "Share" action: add a user or a public link, revoke existing. */
export default function ShareDialog({
  path,
  name,
  onClose,
}: {
  path: string;
  name: string;
  onClose: () => void;
}) {
  const [shares, setShares] = useState<Share[]>([]);
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listShares("by-me").then(
      (all) => setShares(all.filter((s) => s.path === path)),
      () => setError("Couldn't load existing shares."),
    );
  }, [path]);
  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function create(target: { with: string } | { link: true }) {
    setBusy(true);
    setError(null);
    try {
      await createShare({
        path,
        ...target,
        expiresAt: days ? Date.now() + days * 86_400_000 : null,
      });
      setEmail("");
      load();
    } catch (err) {
      setError(
        isNetworkError(err)
          ? "Can't reach the API."
          : err instanceof ApiError
            ? err.message
            : "Couldn't create the share.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${name}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-foreground/15 bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="break-all text-base normal-case">Share “{name}”</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-foreground/50 hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-foreground/60">
          Recipients get read-only access (view and download).
        </p>

        <div className="mt-4 flex flex-col gap-3 text-sm">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-fit rounded border border-foreground/20 bg-surface px-2 py-1"
            aria-label="Expiry"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) void create({ with: email.trim() });
            }}
            className="flex gap-2"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Share with (email)"
              className="min-w-0 flex-1 rounded border border-foreground/20 bg-surface px-2 py-1 outline-none focus:border-accent"
            />
            <button type="submit" disabled={busy} className="rounded border border-foreground/20 px-3 py-1 uppercase tracking-wide hover:bg-foreground/10 disabled:opacity-50">
              Share
            </button>
          </form>

          <button
            type="button"
            disabled={busy}
            onClick={() => void create({ link: true })}
            className="w-fit rounded border border-foreground/20 px-3 py-1 uppercase tracking-wide hover:bg-foreground/10 disabled:opacity-50"
          >
            Create public link
          </button>

          {error && <p className="text-red-600">{error}</p>}

          {shares.length > 0 && (
            <ul className="mt-2 flex flex-col border-t border-foreground/10">
              {shares.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 border-b border-foreground/10 py-2">
                  <span className="min-w-0 break-all">
                    {s.recipientEmail ?? "Public link"}
                    <span className="block text-xs text-foreground/60">
                      {s.expiresAt ? `until ${new Date(s.expiresAt).toLocaleDateString()}` : "no expiry"}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-3">
                    {s.token && (
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(linkFor(s.token!))}
                        className="text-accent hover:underline"
                      >
                        Copy link
                      </button>
                    )}
                    <button type="button" onClick={() => void deleteShare(s.id).then(load)} className="text-red-600 hover:underline">
                      Revoke
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
