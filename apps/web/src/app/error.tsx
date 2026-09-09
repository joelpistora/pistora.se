'use client'; // Error components must be Client Components

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h2 className="mb-4 text-2xl font-semibold">Something went wrong</h2>
        <p className="mb-6 text-foreground/70">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={() => reset()}
          className="rounded bg-foreground px-4 py-2 text-background transition hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
