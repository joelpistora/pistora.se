import type { FileEntry } from "shared";

export interface HealthResponse {
  status: "ok";
}

export interface PingResponse {
  pong: true;
  /** ISO 8601 timestamp from the live process. */
  at: string;
  from: string;
}

/** `POST /api/files/<dir>` → 201. */
export interface UploadResult {
  created: FileEntry[];
}

/** `POST /api/dirs/<path>` → 201. `path` echoes the request path, un-normalised. */
export interface MkdirResult {
  path: string;
}

export interface RequestOpts {
  signal?: AbortSignal;
}

export interface DownloadOpts extends RequestOpts {
  /** Force `Content-Disposition: attachment` (`?download=1`). */
  download?: boolean;
}

export interface DeleteOpts extends RequestOpts {
  /** Delete a non-empty directory and its contents (`?recursive=1`). */
  recursive?: boolean;
}
