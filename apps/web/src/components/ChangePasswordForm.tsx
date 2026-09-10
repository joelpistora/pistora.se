"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { changePassword } from "@/lib/api";
import { authErrorMessage } from "@/lib/authErrors";

const MIN_LEN = 10;
const FIELD =
  "w-full rounded border border-foreground/20 bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

export default function ChangePasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading, refresh } = useAuth();
  const forced = params.get("forced") === "1";

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/account/password");
  }, [loading, user, router]);

  if (loading || !user) {
    return <p className="text-sm text-foreground/60">Loading…</p>;
  }

  const localError =
    next.length > 0 && next.length < MIN_LEN
      ? `New password must be at least ${MIN_LEN} characters.`
      : confirm.length > 0 && next !== confirm
        ? "The two new passwords don't match."
        : next.length > 0 && next === current
          ? "New password must be different from the current one."
          : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (localError) return;
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      await refresh();
      router.replace("/files");
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {forced ? "Set a new password" : "Change password"}
        </h1>
        {forced && (
          <p className="mt-2 rounded border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-foreground/80">
            You&apos;re signed in with a one-time password. Choose a new one to continue.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {forced ? "One-time password" : "Current password"}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          New password
          <input
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={FIELD}
          />
        </label>

        {(localError || error) && (
          <p className="text-sm text-red-600">{localError ?? error}</p>
        )}

        <button
          type="submit"
          disabled={busy || localError !== null}
          className="rounded bg-accent px-4 py-2 text-sm text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save new password"}
        </button>

        {!forced && (
          <Link href="/files" className="text-center text-sm text-foreground/60 hover:text-foreground">
            Cancel
          </Link>
        )}
      </form>
    </div>
  );
}
