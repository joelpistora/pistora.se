"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

/**
 * Fixed top-right identity strip, shown on every page. Signed in: the email, an
 * Admin link for admins, and Sign out. Signed out: a Sign in link (hidden on the
 * login page itself).
 */
export default function UserMenu() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  if (loading) return null;

  async function handleSignOut() {
    setBusy(true);
    await logout();
    router.push("/");
  }

  return (
    <div className="fixed right-4 top-4 z-10 flex items-center gap-3 text-sm">
      {user ? (
        <>
          {user.role === "admin" && (
            <Link
              href="/admin"
              className="text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
            >
              Admin
            </Link>
          )}
          <span className="max-w-[45vw] truncate text-foreground/70" title={user.email}>
            {user.email}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            className="rounded border border-foreground/15 bg-background px-2.5 py-1 text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-50"
          >
            Sign out
          </button>
        </>
      ) : (
        pathname !== "/login" && (
          <Link
            href="/login"
            className="rounded border border-foreground/15 bg-background px-2.5 py-1 text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            Sign in
          </Link>
        )
      )}
    </div>
  );
}
