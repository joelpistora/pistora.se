import { Suspense } from "react";
import PublicShare from "@/components/PublicShare";

export default function SharedLinkPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 pb-10 pt-16">
      <h1 className="mb-6 text-3xl">Shared with you</h1>
      <Suspense fallback={<p className="text-sm text-foreground/60">Loading…</p>}>
        <PublicShare />
      </Suspense>
    </main>
  );
}
