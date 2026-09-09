import type { ErrorCode } from "shared";

/**
 * The API responded with a non-2xx status. `code` is the stable slug from the
 * `{ error: { code, message } }` envelope (see `shared` → `ErrorCode`); when the
 * body isn't an envelope it's derived from the HTTP status.
 */
export class ApiError extends Error {
  readonly code: ErrorCode | (string & {});
  readonly status: number;
  readonly details?: unknown;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
  }
}

/**
 * `fetch()` itself rejected — the request never got a response. Offline, DNS
 * failure, connection refused (API not running), or a CORS preflight rejection.
 */
export class NetworkError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "NetworkError";
    this.cause = cause;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export function isNetworkError(e: unknown): e is NetworkError {
  return e instanceof NetworkError;
}
