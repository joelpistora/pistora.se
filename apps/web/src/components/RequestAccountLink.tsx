"use client";

import { useState } from "react";
import { requestAccount } from "@/lib/api";
import { authErrorMessage } from "@/lib/authErrors";

const FIELD =
  "w-full rounded border border-foreground/20 bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

/**
 * Self-service account request, inline on the login page. Idle → its own small
 * email form (separate from the sign-in form above it) → a confirmation
 * message once the request has been sent. The account is created immediately
 * server-side; the OTP goes to the admin by email, never back to this form.
 */
export default function RequestAccountLink() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (sent) {
    return (
      <p className="text-sm text-foreground/70">
        An account request has been sent to the administrator. You will
        receive a one time password once he checks his mail.
      </p>
    );
  }

  if (!open) {
    return (
      <p className="text-sm text-foreground/60">
        Don&apos;t have an account?{" "}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-accent hover:underline"
        >
          Click here to request an account
        </button>
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestAccount(email.trim());
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded border border-foreground/15 p-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        Your email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD}
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent px-3 py-1.5 text-sm text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-sm text-foreground/60 hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
