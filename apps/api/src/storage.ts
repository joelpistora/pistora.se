import fs from "node:fs";
import path from "node:path";

/**
 * The path-safety primitive. Every filesystem operation a route performs goes
 * through `resolve()` first: it turns a client-supplied relative path into an
 * absolute path that is *guaranteed* to sit inside the storage root, or throws.
 *
 * Node has no built-in "safe join" / `openat`, so the containment check is
 * explicit and covered hard by storage.test.ts. Two layers:
 *   1. lexical — normalise and reject anything that resolves to `..` or above.
 *   2. symlink — realpath the nearest existing ancestor and re-check, so a
 *      symlink planted inside the root can't point the caller at `/etc`.
 */
export interface Storage {
  /** Canonical absolute path of the storage root (symlinks collapsed). */
  readonly root: string;
  /**
   * Resolve `userPath` (a relative path with `/` separators) against the root.
   * Returns an absolute path inside the root. Throws {@link PathError} on bad
   * input (400) or an escape attempt (403). `""` and `"."` resolve to the root.
   */
  resolve(userPath: string): string;
  /**
   * Reserved for the auth phase: a sub-storage scoped to `users/<userId>`.
   * Not wired to any route yet — it's the seam per-user isolation slots into.
   */
  forUser(userId: string): Storage;
}

export class PathError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PathError";
  }
}

const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:[\\/]/;
const USER_ID = /^[a-z0-9_-]{1,64}$/i;

export function createStorage(root: string): Storage {
  const rootResolved = path.resolve(root);
  // Collapse any symlinks in the root path itself so later comparisons are
  // apples-to-apples. The root must exist (loadConfig guarantees it for the
  // real app; tests create the dir before calling).
  const rootReal = fs.realpathSync(rootResolved);
  const rootRealPrefix = rootReal + path.sep;

  function resolve(userPath: string): string {
    if (typeof userPath !== "string") {
      throw new PathError(400, "bad_path", "path must be a string");
    }
    if (userPath.includes("\0")) {
      throw new PathError(400, "bad_path", "path contains a NUL byte");
    }
    if (path.isAbsolute(userPath) || WINDOWS_DRIVE_PREFIX.test(userPath)) {
      throw new PathError(400, "bad_path", "absolute paths are not allowed");
    }

    // Layer 1: lexical containment.
    const abs = path.resolve(rootReal, userPath);
    const rel = path.relative(rootReal, abs);
    if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
      throw new PathError(403, "path_escape", "path escapes the storage root");
    }

    // Layer 2: symlink containment. realpath the deepest ancestor that exists,
    // then re-attach the not-yet-created tail, and check the result is still
    // inside the root.
    const real = realpathOfNearestExisting(abs);
    if (real !== rootReal && !real.startsWith(rootRealPrefix)) {
      throw new PathError(
        403,
        "path_escape",
        "path resolves outside the storage root via a symlink",
      );
    }

    return abs;
  }

  const api: Storage = {
    root: rootReal,
    resolve,
    forUser(userId: string): Storage {
      if (!USER_ID.test(userId)) {
        throw new PathError(400, "bad_user", "invalid user id");
      }
      return createStorage(path.join(rootReal, "users", userId));
    },
  };
  return api;
}

/**
 * Make sure `users/<userId>` exists on disk, then return a {@link Storage}
 * scoped to it. This is the wrapper every caller should use: `forUser()` alone
 * throws if the directory is missing (it realpaths its root at construction),
 * and creating the folder here keeps the API self-healing if the drive is wiped
 * or a provisioning step was skipped. Idempotent.
 */
export function ensureUserDir(storage: Storage, userId: string): Storage {
  if (!USER_ID.test(userId)) {
    throw new PathError(400, "bad_user", "invalid user id");
  }
  fs.mkdirSync(path.join(storage.root, "users", userId), { recursive: true });
  return storage.forUser(userId);
}

/**
 * Walk up from `target` until a path component exists on disk, realpath that,
 * then re-append the missing tail components. Lets us validate the destination
 * of a not-yet-created file without it existing.
 */
function realpathOfNearestExisting(target: string): string {
  let current = target;
  const missing: string[] = [];
  for (;;) {
    try {
      const real = fs.realpathSync(current);
      return missing.length
        ? path.join(real, ...missing.reverse())
        : real;
    } catch {
      missing.push(path.basename(current));
      const parent = path.dirname(current);
      if (parent === current) {
        throw new PathError(403, "path_escape", "path could not be resolved");
      }
      current = parent;
    }
  }
}
