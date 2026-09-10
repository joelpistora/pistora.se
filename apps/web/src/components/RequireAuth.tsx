"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

/**
 * Client-side route guard for `/files` and `/admin`. The API is the real
 * enforcement point; this just keeps unauthenticated visitors from seeing a
 * broken shell. Renders only "Loading…" until it knows where the visitor stands.
 */
export default function RequireAuth({
  role,
  children,
}: {
  role?: "admin";
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const blocked =
    !loading &&
    (!user || user.mustChangePassword || (role === "admin" && user.role !== "admin"));

  useEffect(() => {
    if (loading || !blocked) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (user.mustChangePassword) {
      router.replace("/account/password?forced=1");
    } else {
      router.replace("/files");
    }
  }, [loading, blocked, user, router, pathname]);

  if (loading || blocked) {
    return <p className="text-sm text-foreground/60">Loading…</p>;
  }
  return <>{children}</>;
}
