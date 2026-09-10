// Shared DTOs for the Pistora storage API. Consumed as SOURCE (.ts) by both apps
// via npm-workspaces resolution — there is intentionally NO build step.
//
// POLICY: types-only. Do NOT add runtime code (const / enum / function / class).
// apps/api imports these with `import type`, so nothing in apps/api/dist resolves
// "shared" at runtime. A runtime value here would pass typecheck + `tsx` dev but
// break `node dist/server.js` in prod (Node can't execute a .ts file). If shared
// runtime code is ever needed, add a `tsc` build step (emit dist/ js+d.ts,
// repoint `exports`) first.

export interface FileEntry {
  name: string;
  type: "file" | "directory";
  /** Bytes. Always 0 for directories. */
  size: number;
  /** ISO 8601. */
  modifiedAt: string;
}

export interface DirListing {
  /** Normalised relative path from the storage root. "" is the root itself. */
  path: string;
  entries: FileEntry[];
}

export interface FileMetadata extends FileEntry {
  path: string;
  /** ISO 8601. Birthtime where the platform reports it, else the same as modifiedAt. */
  createdAt: string;
}

/** `PATCH /api/files/<path>` — the entry at its new location after a rename or move. */
export interface MoveResult extends FileEntry {
  /** Normalised destination path from the storage root. */
  path: string;
}

// ---- auth -----------------------------------------------------------------

export type Role = "admin" | "user";
export type UserStatus = "active" | "disabled";

/** The current user as the API reports it to the browser. Never carries secrets. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  /** True until the user replaces their one-time password. Gates everything else. */
  mustChangePassword: boolean;
  /** Upload ceiling in bytes. Not enforced for admins (they browse the whole root). */
  quotaBytes: number;
}

/** `GET /api/usage` — the caller's own storage footprint. */
export interface UsageResponse {
  usedBytes: number;
  /** The caller's ceiling, or null for an admin (unlimited). */
  quotaBytes: number | null;
}

/** Body of `POST /api/auth/login`, `POST /api/auth/change-password`, `GET /api/auth/me`. */
export interface SessionResponse {
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** A user row as the admin console sees it — richer than {@link AuthUser}, still no secrets. */
export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
  quotaBytes: number;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601, or null if the user has never logged in. */
  lastLoginAt: string | null;
}

export interface AdminUserListResponse {
  users: AdminUser[];
}

/** `POST /api/admin/users` — `otp` is only present when the API is configured to expose it. */
export interface CreateUserResponse {
  user: AdminUser;
  otp?: string;
}

/**
 * Stable, machine-readable slugs the API puts in `ErrorEnvelope.error.code`.
 * The frontend branches on these. Mirrors `apps/api/src/http.ts` +
 * `apps/api/src/storage.ts` (`PathError`). Any 5xx collapses to `internal`.
 */
export type ErrorCode =
  | "validation"
  | "internal"
  | "not_found"
  | "bad_request"
  | "conflict"
  | "payload_too_large"
  | "unsupported_media_type"
  | "bad_path"
  | "path_escape"
  | "forbidden"
  | "unauthorized"
  | "session_expired"
  | "account_disabled"
  | "password_change_required"
  | "otp_expired"
  | "weak_password"
  | "too_many_requests"
  | "quota_exceeded";

export interface ErrorEnvelope {
  error: {
    /** A known {@link ErrorCode}, or an unrecognised future slug. */
    code: ErrorCode | (string & {});
    message: string;
    details?: unknown;
  };
}
