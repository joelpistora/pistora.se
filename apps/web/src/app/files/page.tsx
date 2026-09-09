import { Suspense } from "react";
import FileBrowser from "@/components/FileBrowser";

export default function FilesPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 pb-10 pt-16">
      <p className="mb-6 text-sm text-foreground/60">
        Self-hosted file storage on the Pistora home server.
      </p>
      <Suspense
        fallback={<p className="text-sm text-foreground/60">Loading…</p>}
      >
        <FileBrowser />
      </Suspense>
    </main>
  );
}
