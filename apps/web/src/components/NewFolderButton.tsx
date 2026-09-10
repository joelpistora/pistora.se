"use client";

import { useState } from "react";
import { ApiError, isNetworkError, makeDir } from "@/lib/api";

/** One path segment — no slash, and not a lone/double dot. */
const VALID_NAME = /^[^/\\]+$/;
function isValidName(name: string): boolean {
  return VALID_NAME.test(name) && name !== "." && name !== "..";
}

/**
 * "New folder" — toggles into a small inline form and calls `POST /api/dirs`
 * for the current directory. `mkdir -p` is idempotent, so re-creating an
 * existing folder is a no-op rather than an error.
 */
export default function NewFolderButton({
  path,
  onCreated,
}: {
  path: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setName("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!isValidName(trimmed)) {
      setError(`"${trimmed}" isn't a valid folder name.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await makeDir(path ? `${path}/${trimmed}` : trimmed);
      reset();
      onCreated();
    } catch (err) {
      setError(
        isNetworkError(err)
          ? "Can't reach the API."
          : err instanceof ApiError
            ? `Couldn't create the folder: ${err.message}`
            : "Couldn't create the folder.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-foreground/20 px-3 py-1.5 text-sm hover:bg-foreground/10"
      >
        New folder
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && reset()}
        placeholder="Folder name"
        className="w-40 rounded border border-foreground/20 bg-background px-2 py-1 text-sm outline-none focus:border-foreground/50"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded border border-foreground/20 px-3 py-1.5 text-sm hover:bg-foreground/10 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create"}
      </button>
      <button
        type="button"
        onClick={reset}
        className="text-sm text-foreground/50 hover:text-foreground"
      >
        Cancel
      </button>
      {error && <span className="w-full text-sm text-red-600">{error}</span>}
    </form>
  );
}
