import Link from "next/link";
import ApiStatus from "@/components/ApiStatus";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center p-8 text-center">
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <h1 className="text-5xl font-semibold">Pistora Web</h1>

        <ApiStatus />

        <div className="flex w-full max-w-xs flex-col gap-3">
          {/* Auth-gated: /files bounces to /login when signed out. */}
          <Link
            href="/files"
            className="rounded bg-accent px-5 py-2.5 text-accent-foreground transition hover:opacity-90"
          >
            Hard Drive
          </Link>

          <div className="grid grid-cols-2 gap-3">
            <a
              href="https://capitalpidesign.se/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-foreground/20 px-3 py-2.5 transition hover:bg-foreground/10"
            >
              capitalpidesign.se
            </a>

            <a
              href="https://oltorget.nu/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-foreground/20 px-3 py-2.5 transition hover:bg-foreground/10"
            >
              Öltorget
            </a>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <a
              href="https://pistora.wordpress.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-foreground/20 px-3 py-2.5 transition hover:bg-foreground/10"
            >
              Blog
            </a>

            {/* joel.pistora.se — Phase 6, not built yet; link ships ahead of it. */}
            <a
              href="https://joel.pistora.se"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-foreground/20 px-3 py-2.5 transition hover:bg-foreground/10"
            >
              Joel
            </a>
          </div>
        </div>
      </div>

      <p className="pb-4 text-sm text-foreground/60">
        <a href="mailto:joel@pistora.se" className="hover:text-accent hover:underline">
          joel@pistora.se
        </a>
        {" · "}
        <a href="mailto:nils@pistora.se" className="hover:text-accent hover:underline">
          nils@pistora.se
        </a>
      </p>
    </main>
  );
}
