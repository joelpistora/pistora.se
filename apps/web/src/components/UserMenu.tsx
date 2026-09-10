"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

/**
 * Fixed top-right account menu. Nothing renders when signed out. Signed in: a
 * trigger showing the email that opens a dropdown with the identity line, a
 * "Register new account" link for admins, and "Log out".
 */
export default function UserMenu() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading || !user) return null;

  function handleSignOut() {
    setOpen(false);
    void logout(); // clears the session locally right away; API call is best-effort
    router.push("/");
  }

  return (
    <div ref={ref} className="fixed right-4 top-4 z-20 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded border border-foreground/15 bg-background px-3 py-1.5 text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <span className="max-w-[40vw] truncate">{user.email}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 overflow-hidden rounded-md border border-foreground/15 bg-background shadow-lg"
        >
          <p className="border-b border-foreground/10 px-3 py-2 text-xs text-foreground/60">
            Logged in as
            <br />
            <span className="text-sm text-foreground/90">{user.email}</span>
          </p>

          {user.role === "admin" && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                router.push("/admin");
              }}
              className="block w-full px-3 py-2 text-left transition-colors hover:bg-foreground/10"
            >
              Register new account
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="block w-full px-3 py-2 text-left text-red-600 transition-colors hover:bg-foreground/10"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
