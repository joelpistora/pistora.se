"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Fixed house icon in the top-left corner linking to the landing page. Hidden on `/`. */
export default function HomeButton() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <Link
      href="/"
      aria-label="Home"
      className="fixed left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded border border-foreground/15 bg-background text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden
      >
        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
        <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    </Link>
  );
}
