/**
 * Typed client for the Pistora storage API. Framework-agnostic — uses only the
 * global `fetch` / `FormData` / `Blob`, so it works from Server Components,
 * Client Components and Route Handlers alike.
 *
 * Base URL comes from `NEXT_PUBLIC_API_BASE` (see `./config`).
 */
export { API_BASE } from "./config";
export {
  ApiError,
  NetworkError,
  isApiError,
  isNetworkError,
} from "./errors";
export { encodePath } from "./paths";
export {
  request,
  getHealth,
  ping,
  listDir,
  statEntry,
  downloadResponse,
  downloadFile,
  fileUrl,
  uploadFiles,
  deleteEntry,
  makeDir,
} from "./client";
export type {
  HealthResponse,
  PingResponse,
  UploadResult,
  MkdirResult,
  RequestOpts,
  DownloadOpts,
  DeleteOpts,
} from "./types";
export type {
  FileEntry,
  DirListing,
  FileMetadata,
  ErrorEnvelope,
  ErrorCode,
} from "shared";
