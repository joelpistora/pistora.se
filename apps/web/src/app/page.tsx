import Link from "next/link";
import ApiStatus from "@/components/ApiStatus";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Pistora Storage</h1>
        <p className="text-foreground/70">
          Self-hosted file storage on the Pistora home server.
        </p>
      </div>

      <ApiStatus />

      <Link
        href="/files"
        className="rounded bg-foreground px-5 py-2 text-background transition hover:opacity-90"
      >
        Open files →
      </Link>
    </main>
  );
}
