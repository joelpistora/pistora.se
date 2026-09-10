import Link from "next/link";
import ApiStatus from "@/components/ApiStatus";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 p-8 text-center">
      <h1 className="text-3xl font-semibold">Pistora Web</h1>

      <ApiStatus />

      <div className="flex w-full max-w-xs flex-col gap-3">
        {/* Auth-gated: /files bounces to /login when signed out. */}
        <Link
          href="/files"
          className="rounded bg-accent px-5 py-2.5 text-accent-foreground transition hover:opacity-90"
        >
          Hard Drive
        </Link>

        <div className="group relative flex flex-col">
          <button
            type="button"
            disabled
            aria-label="Music (coming soon)"
            className="cursor-not-allowed rounded border border-foreground/15 px-5 py-2.5 text-foreground/40"
          >
            Music
          </button>
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 scale-95 whitespace-nowrap rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition-all duration-150 group-hover:scale-100 group-hover:opacity-100"
          >
            Coming soon…
            <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-foreground" />
          </div>
        </div>

        <a
          href="https://skanepowerhouse.com"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-foreground/20 px-5 py-2.5 transition hover:bg-foreground/10"
        >
          Powerhouse
        </a>
      </div>
    </main>
  );
}
