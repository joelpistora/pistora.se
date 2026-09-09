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
  | "forbidden";

export interface ErrorEnvelope {
  error: {
    /** A known {@link ErrorCode}, or an unrecognised future slug. */
    code: ErrorCode | (string & {});
    message: string;
    details?: unknown;
  };
}
