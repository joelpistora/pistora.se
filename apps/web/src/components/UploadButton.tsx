"use client";

import { useRef, useState } from "react";
import { ApiError, isNetworkError, uploadFiles } from "@/lib/api";

interface UploadButtonProps {
  /** Folder to upload into, "" for the storage root. */
  path: string;
  /** Called after a successful upload so the listing can refresh. */
  onUploaded: () => void;
}

export default function UploadButton({ path, onUploaded }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    setBusy(file.name);
    setError(null);
    try {
      await uploadFiles(path, [file]);
      onUploaded();
    } catch (err) {
      if (isNetworkError(err)) {
        setError("Upload failed — can't reach the API.");
      } else if (err instanceof ApiError) {
        setError(`Upload failed: ${err.message}`);
      } else {
        setError("Upload failed.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        onChange={handlePick}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy !== null}
        className="rounded border border-foreground/20 px-3 py-1.5 text-sm hover:bg-foreground/10 disabled:opacity-50"
      >
        Upload file
      </button>
      {busy && (
        <span className="text-sm text-foreground/60">Uploading {busy}…</span>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
