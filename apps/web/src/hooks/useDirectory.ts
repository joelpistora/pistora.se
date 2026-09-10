"use client";

import { useCallback, useEffect, useState } from "react";
import {
  API_BASE,
  ApiError,
  isNetworkError,
  listDir,
  type DirListing,
} from "@/lib/api";

export interface UseDirectory {
  listing: DirListing | null;
  loading: boolean;
  /** Human-readable error, or null. */
  error: string | null;
  reload: () => void;
}

/**
 * Fetch the listing for `path` ("" is the storage root). Re-runs when `path`
 * changes or `reload()` is called (e.g. after an upload). In-flight requests are
 * aborted on change/unmount.
 */
export function useDirectory(path: string): UseDirectory {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    listDir(path, { signal: controller.signal })
      .then((data) => {
        setListing(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setListing(null);
        setLoading(false);
        if (isNetworkError(err)) {
          setError(
            `Can't reach the API at ${API_BASE} — is the backend running (npm run dev:api)?`,
          );
        } else if (err instanceof ApiError && err.status === 401) {
          setError("Your session ended — taking you to sign in…");
        } else if (err instanceof ApiError && err.code === "password_change_required") {
          setError("You need to set a new password first…");
        } else if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Something went wrong loading this folder.");
        }
      });

    return () => controller.abort();
  }, [path, nonce]);

  return { listing, loading, error, reload };
}
