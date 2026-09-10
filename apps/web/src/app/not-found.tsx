import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h2 className="mb-4 text-2xl font-semibold">404 — Not found</h2>
        <p className="mb-6 text-foreground/70">
          The page you are looking for does not exist.
        </p>
        <Link href="/" className="text-accent underline underline-offset-4 hover:opacity-70">
          Return home
        </Link>
      </div>
    </div>
  );
}
