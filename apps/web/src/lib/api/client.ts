import type {
  DirListing,
  ErrorEnvelope,
  FileMetadata,
} from "shared";
import { API_BASE } from "./config";
import { ApiError, NetworkError } from "./errors";
import { encodePath } from "./paths";
import type {
  DeleteOpts,
  DownloadOpts,
  HealthResponse,
  MkdirResult,
  PingResponse,
  RequestOpts,
  UploadResult,
} from "./types";

type QueryValue = string | number | boolean | undefined;

/** Mirrors `apps/api/src/http.ts` `STATUS_SLUGS` for bodies that aren't an envelope. */
function statusToCode(status: number): string {
  if (status >= 500) return "internal";
  const map: Record<number, string> = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "unprocessable_entity",
    429: "too_many_requests",
  };
  return map[status] ?? "error";
}

function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === false) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value === true ? 1 : value)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

function isEnvelope(body: unknown): body is ErrorEnvelope {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as ErrorEnvelope).error?.code === "string" &&
    typeof (body as ErrorEnvelope).error?.message === "string"
  );
}

/** Build an `ApiError` from a failed `Response`, reading the envelope if present. */
async function errorFrom(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (isEnvelope(body)) {
    return new ApiError({
      code: body.error.code,
      message: body.error.message,
      status: res.status,
      details: body.error.details,
    });
  }
  return new ApiError({
    code: statusToCode(res.status),
    message: `HTTP ${res.status} ${res.statusText}`.trim(),
    status: res.status,
  });
}

async function doFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    // `credentials: "include"` sends the session cookie cross-origin
    // (pistora.se → api.pistora.se). The API allowlists the origin + sets
    // Access-Control-Allow-Credentials, so this is not a wildcard CORS hole.
    return await fetch(url, { credentials: "include", ...init });
  } catch (e) {
    throw new NetworkError(`request to ${url} failed`, e);
  }
}

/**
 * Called whenever the API answers 401. The app sets this to clear its cached
 * user so route guards bounce to `/login`. Kept as a plain callback so this
 * module stays free of any `next/*` / `react` import.
 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

interface RequestInitEx extends RequestInit {
  query?: Record<string, QueryValue>;
}

/**
 * Core JSON request. Throws {@link ApiError} on non-2xx, {@link NetworkError} if
 * the request never completed. `204` resolves to `undefined`.
 */
export async function request<T>(path: string, init: RequestInitEx = {}): Promise<T> {
  const { query, ...rest } = init;
  const url = API_BASE + path + buildQuery(query);
  const res = await doFetch(url, { cache: "no-store", ...rest });

  if (res.status === 401) onUnauthorized?.();
  if (!res.ok) throw await errorFrom(res);
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---- health / connectivity -------------------------------------------------

export function getHealth(opts: RequestOpts = {}): Promise<HealthResponse> {
  return request<HealthResponse>("/health", { signal: opts.signal });
}

export function ping(opts: RequestOpts = {}): Promise<PingResponse> {
  return request<PingResponse>("/api/ping", { signal: opts.signal });
}

// ---- files ---------------------------------------------------------------

/** `GET /api/files/<path>` — the path must be a directory. */
export function listDir(path: string, opts: RequestOpts = {}): Promise<DirListing> {
  return request<DirListing>(`/api/files/${encodePath(path)}`, { signal: opts.signal });
}

/** `GET /api/files/<path>?stat=1` — metadata for a file or a directory. */
export function statEntry(path: string, opts: RequestOpts = {}): Promise<FileMetadata> {
  return request<FileMetadata>(`/api/files/${encodePath(path)}`, {
    query: { stat: true },
    signal: opts.signal,
  });
}

/**
 * `GET /api/files/<path>` — the raw `Response` for a file. Callers stream
 * `res.body` and read the CORS-exposed `Content-Disposition` / `Content-Length`
 * / `Content-Type` headers. Throws {@link ApiError} on non-2xx.
 *
 * The API sends `Accept-Ranges: none` — no partial/resumable downloads.
 */
export async function downloadResponse(
  path: string,
  opts: DownloadOpts = {},
): Promise<Response> {
  const url =
    API_BASE +
    `/api/files/${encodePath(path)}` +
    buildQuery({ download: opts.download });
  const res = await doFetch(url, { cache: "no-store", signal: opts.signal });
  if (res.status === 401) onUnauthorized?.();
  if (!res.ok) throw await errorFrom(res);
  return res;
}

/** `GET /api/files/<path>` — a file's bytes as a `Blob`. */
export async function downloadFile(path: string, opts: DownloadOpts = {}): Promise<Blob> {
  return (await downloadResponse(path, opts)).blob();
}

/**
 * A plain URL for `<a href>` / `<img src>` — `${API_BASE}/api/files/<path>`,
 * with `?download=1` when `download` is set. No auth token today (Phase 1).
 */
export function fileUrl(path: string, opts: { download?: boolean } = {}): string {
  return (
    API_BASE +
    `/api/files/${encodePath(path)}` +
    buildQuery({ download: opts.download })
  );
}

/**
 * `POST /api/files/<dir>` — multipart upload into an existing directory. Every
 * file goes under the field name `file` (the API ignores field names). The
 * `Content-Type` header is left unset so the runtime adds the multipart
 * boundary. Not atomic as a batch: on a mid-batch failure earlier files stay
 * committed — re-list to see what landed.
 */
export function uploadFiles(
  path: string,
  files: File[] | FileList,
  opts: RequestOpts = {},
): Promise<UploadResult> {
  const form = new FormData();
  for (const file of Array.from(files)) form.append("file", file, file.name);
  return request<UploadResult>(`/api/files/${encodePath(path)}`, {
    method: "POST",
    body: form,
    signal: opts.signal,
  });
}

/** `DELETE /api/files/<path>` — `recursive` for a non-empty directory. */
export function deleteEntry(path: string, opts: DeleteOpts = {}): Promise<void> {
  return request<void>(`/api/files/${encodePath(path)}`, {
    method: "DELETE",
    query: { recursive: opts.recursive },
    signal: opts.signal,
  });
}

// ---- dirs --------------------------------------------------------------------

/** `POST /api/dirs/<path>` — `mkdir -p`. Idempotent. */
export function makeDir(path: string, opts: RequestOpts = {}): Promise<MkdirResult> {
  return request<MkdirResult>(`/api/dirs/${encodePath(path)}`, {
    method: "POST",
    signal: opts.signal,
  });
}
