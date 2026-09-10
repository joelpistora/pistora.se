"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { login } from "@/lib/api";
import { authErrorMessage } from "@/lib/authErrors";

const FIELD =
  "w-full rounded border border-foreground/20 bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading, refresh } = useAuth();
  const next = params.get("next") || "/files";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in? Don't show the form.
  useEffect(() => {
    if (!loading && user) {
      router.replace(user.mustChangePassword ? "/account/password?forced=1" : next);
    }
  }, [loading, user, next, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await login(email.trim(), password);
      await refresh();
      router.replace(user.mustChangePassword ? "/account/password?forced=1" : next);
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        {/* <p className="mt-1 text-sm text-foreground/60">
          Pistora file storage. Accounts are created by an administrator.
        </p> */}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={FIELD}
          />
        </label>

        <p className="text-sm text-foreground/60">
          Contact administrator for an account
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent px-4 py-2 text-sm text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Confirm"}
        </button>
      </form>
    </div>
  );
}
