import type { ErrorEnvelope } from "shared";
import { API_BASE } from "./config";
import { ApiError, NetworkError } from "./errors";
import { encodePath } from "./paths";

/**
 * Upload one file with progress. `fetch` can't report upload progress, so this
 * uses XHR. Resolves when the server answers 201; rejects with {@link ApiError}
 * (envelope code preserved), {@link NetworkError}, or a `DOMException`
 * (`AbortError`) when `signal` aborts.
 */
export function uploadFileWithProgress(
  dir: string,
  file: File,
  opts: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${API_BASE}/api/files/${encodePath(dir)}`;
    xhr.open("POST", url);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let env: ErrorEnvelope | undefined;
      try {
        env = JSON.parse(xhr.responseText) as ErrorEnvelope;
      } catch {
        /* not JSON */
      }
      reject(
        new ApiError({
          code: env?.error?.code ?? (xhr.status >= 500 ? "internal" : "error"),
          message: env?.error?.message ?? `HTTP ${xhr.status}`,
          status: xhr.status,
        }),
      );
    };
    xhr.onerror = () => reject(new NetworkError(`request to ${url} failed`, undefined));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));

    if (opts.signal) {
      if (opts.signal.aborted) return reject(new DOMException("Upload cancelled", "AbortError"));
      opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    const form = new FormData();
    form.append("file", file, file.name);
    xhr.send(form);
  });
}
