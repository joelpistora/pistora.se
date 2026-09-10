import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthUser } from "shared";
import {
  deleteSession,
  deleteSessionsForUser,
  getSession,
  touchSession,
} from "../db/sessions.js";
import { getUserById, type UserRow } from "../db/users.js";
import { ensureUserDir, type Storage } from "../storage.js";
import { hashToken } from "./crypto.js";

declare module "fastify" {
  interface FastifyRequest {
    /** The authenticated user, or null on the open routes. Set by {@link makeAuthHook}. */
    user: AuthUser | null;
    /** Storage scoped to `users/<id>`. Only meaningful inside the guarded scope. */
    storage: Storage;
  }
}

/**
 * A thrown auth failure. Mirrors `PathError` (storage.ts): `statusCode` +
 * a lowercase `code` slug that `http.ts`'s error handler passes straight into
 * the `{ error: { code, message } }` envelope.
 */
export class AuthError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    mustChangePassword: row.must_change_password,
  };
}

export function originAllowed(
  origin: string,
  allow: (string | RegExp)[],
): boolean {
  return allow.some((rule) =>
    typeof rule === "string" ? rule === origin : rule.test(origin),
  );
}

/**
 * Resolve the session cookie to a live, enabled user, or throw. Also opportunistically
 * deletes the session row on a terminal failure (expired / user gone / disabled).
 */
export async function authenticateRequest(
  app: FastifyInstance,
  req: FastifyRequest,
): Promise<UserRow> {
  const token = req.cookies[app.config.cookieName];
  if (!token) throw new AuthError(401, "unauthorized", "authentication required");

  const tokenHash = hashToken(token);
  const session = getSession(app.db, tokenHash);
  if (!session) throw new AuthError(401, "unauthorized", "invalid session");

  if (session.expires_at < app.now()) {
    deleteSession(app.db, tokenHash);
    throw new AuthError(401, "session_expired", "your session has expired — sign in again");
  }

  const user = getUserById(app.db, session.user_id);
  if (!user) {
    deleteSession(app.db, tokenHash);
    throw new AuthError(401, "unauthorized", "invalid session");
  }
  if (user.status === "disabled") {
    deleteSessionsForUser(app.db, user.id);
    throw new AuthError(403, "account_disabled", "this account has been disabled");
  }

  touchSession(app.db, tokenHash, app.now());
  return user;
}

interface AuthHookOptions {
  /** Let a must-change-password session through (for /me and /change-password). */
  allowMustChange?: boolean;
  /** Attach `request.storage = storage.forUser(id)` (the guarded file/dir scope). */
  scopeStorage?: boolean;
}

/**
 * Build the auth hook. Used as an `onRequest` hook for the guarded scope and as
 * a `preHandler` for the couple of authenticated `/api/auth` routes.
 */
export function makeAuthHook(
  app: FastifyInstance,
  opts: AuthHookOptions = {},
): (req: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function authHook(req) {
    const user = await authenticateRequest(app, req);

    // CSRF defence-in-depth: a state-changing request that carries a browser
    // Origin must carry one we allow. (SameSite=Lax already blocks the cookie
    // on cross-site POSTs; this covers same-site-but-untrusted sub-origins.)
    const method = req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const origin = req.headers.origin;
      if (origin && !originAllowed(origin, app.config.corsOrigins)) {
        throw new AuthError(403, "forbidden", "request origin is not allowed");
      }
    }

    if (!opts.allowMustChange && user.must_change_password) {
      throw new AuthError(
        403,
        "password_change_required",
        "you must set a new password before continuing",
      );
    }

    req.user = toAuthUser(user);
    if (opts.scopeStorage) {
      // Admins operate on the whole storage root (every user's folder lives
      // under it); everyone else is confined to their own users/<id>/.
      req.storage =
        user.role === "admin"
          ? app.storage
          : ensureUserDir(app.storage, user.id);
    }
  };
}
