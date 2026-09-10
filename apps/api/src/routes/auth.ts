import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { ChangePasswordRequest, LoginRequest, SessionResponse } from "shared";
import { AuthError, makeAuthHook, toAuthUser } from "../auth/hook.js";
import { createLoginThrottle } from "../auth/throttle.js";
import {
  generateSessionToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../auth/crypto.js";
import { createSession, deleteSession } from "../db/sessions.js";
import {
  getUserByEmail,
  getUserById,
  setPassword,
  touchLastLogin,
} from "../db/users.js";
import { ensureUserDir } from "../storage.js";

const MIN_PASSWORD_LEN = 10;
const MAX_PASSWORD_LEN = 200;

const loginBodySchema = {
  type: "object",
  required: ["email", "password"],
  additionalProperties: false,
  properties: {
    email: { type: "string", minLength: 1, maxLength: 320 },
    password: { type: "string", minLength: 1, maxLength: MAX_PASSWORD_LEN },
  },
} as const;

const changePasswordBodySchema = {
  type: "object",
  required: ["currentPassword", "newPassword"],
  additionalProperties: false,
  properties: {
    currentPassword: { type: "string", minLength: 1, maxLength: MAX_PASSWORD_LEN },
    newPassword: { type: "string", minLength: 1, maxLength: MAX_PASSWORD_LEN },
  },
} as const;

const sessionResponseSchema = {
  200: {
    type: "object",
    required: ["user"],
    additionalProperties: false,
    properties: {
      user: {
        type: "object",
        required: ["id", "email", "role", "mustChangePassword", "quotaBytes"],
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          email: { type: "string" },
          role: { type: "string", enum: ["admin", "user"] },
          mustChangePassword: { type: "boolean" },
          quotaBytes: { type: "integer" },
        },
      },
    },
  },
  "4xx": { $ref: "error#" },
  "5xx": { $ref: "error#" },
} as const;

/**
 * `/api/auth/*` — mounted OUTSIDE the guarded scope. `login` / `logout` are open;
 * `me` / `change-password` authenticate via a per-route hook that still lets a
 * must-change-password session through.
 */
export const authRoutes: FastifyPluginAsync = async (app) => {
  const throttle = createLoginThrottle();
  const ttlMs = app.config.sessionTtlHours * 60 * 60 * 1000;

  function setSessionCookie(reply: FastifyReply, token: string): void {
    reply.setCookie(app.config.cookieName, token, {
      httpOnly: true,
      secure: app.config.cookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge: app.config.sessionTtlHours * 60 * 60,
      domain: app.config.cookieDomain,
    });
  }

  function mintSession(
    reply: FastifyReply,
    userId: string,
    userAgent: string | undefined,
    ip: string,
  ): void {
    const token = generateSessionToken();
    const now = app.now();
    createSession(app.db, {
      tokenHash: hashToken(token),
      userId,
      now,
      expiresAt: now + ttlMs,
      userAgent: userAgent ? userAgent.slice(0, 400) : null,
      ip,
    });
    setSessionCookie(reply, token);
  }

  // ---- POST /api/auth/login ------------------------------------------------

  app.post<{ Body: LoginRequest }>(
    "/login",
    { schema: { body: loginBodySchema, response: sessionResponseSchema } },
    async (req, reply): Promise<SessionResponse> => {
      const email = req.body.email.trim().toLowerCase();
      const now = app.now();

      const wait = throttle.retryAfter(email, now);
      if (wait > 0) {
        reply.header("Retry-After", String(wait));
        throw new AuthError(
          429,
          "too_many_requests",
          `too many failed attempts — try again in ${wait}s`,
        );
      }

      const user = getUserByEmail(app.db, email);
      if (!user || !verifyPassword(req.body.password, user.password_hash)) {
        throttle.recordFailure(email, now);
        throw new AuthError(401, "unauthorized", "invalid email or password");
      }
      if (user.status === "disabled") {
        throw new AuthError(403, "account_disabled", "this account has been disabled");
      }
      if (
        user.must_change_password &&
        user.password_expires_at != null &&
        user.password_expires_at < now
      ) {
        throw new AuthError(
          401,
          "otp_expired",
          "this one-time password has expired — ask an admin to resend your invite",
        );
      }

      throttle.reset(email);
      if (user.role !== "admin") ensureUserDir(app.storage, user.email);
      mintSession(reply, user.id, req.headers["user-agent"], req.ip);
      touchLastLogin(app.db, user.id, now);

      return { user: toAuthUser(user) };
    },
  );

  // ---- POST /api/auth/logout ---------------------------------------------

  app.post(
    "/logout",
    { schema: { response: { 204: { type: "null" }, "5xx": { $ref: "error#" } } } },
    async (req, reply) => {
      const token = req.cookies[app.config.cookieName];
      if (token) deleteSession(app.db, hashToken(token));
      reply.clearCookie(app.config.cookieName, {
        path: "/",
        domain: app.config.cookieDomain,
      });
      reply.code(204);
      return null;
    },
  );

  // ---- GET /api/auth/me --------------------------------------------------

  app.get(
    "/me",
    {
      preHandler: makeAuthHook(app, { allowMustChange: true }),
      schema: { response: sessionResponseSchema },
    },
    async (req): Promise<SessionResponse> => {
      return { user: req.user! };
    },
  );

  // ---- POST /api/auth/change-password -----------------------------------

  app.post<{ Body: ChangePasswordRequest }>(
    "/change-password",
    {
      preHandler: makeAuthHook(app, { allowMustChange: true }),
      schema: { body: changePasswordBodySchema, response: sessionResponseSchema },
    },
    async (req, reply): Promise<SessionResponse> => {
      const row = getUserById(app.db, req.user!.id);
      if (!row) throw new AuthError(401, "unauthorized", "invalid session");

      const { currentPassword, newPassword } = req.body;
      if (!verifyPassword(currentPassword, row.password_hash)) {
        throw new AuthError(401, "unauthorized", "current password is incorrect");
      }
      if (
        newPassword.length < MIN_PASSWORD_LEN ||
        newPassword.length > MAX_PASSWORD_LEN ||
        newPassword === currentPassword
      ) {
        throw new AuthError(
          400,
          "weak_password",
          `new password must be ${MIN_PASSWORD_LEN}-${MAX_PASSWORD_LEN} characters and different from the current one`,
        );
      }

      const now = app.now();
      setPassword(app.db, row.id, hashPassword(newPassword), now);

      // Rotate the session across the privilege change (defeats fixation).
      const oldToken = req.cookies[app.config.cookieName];
      if (oldToken) deleteSession(app.db, hashToken(oldToken));
      mintSession(reply, row.id, req.headers["user-agent"], req.ip);

      return { user: toAuthUser(getUserById(app.db, row.id)!) };
    },
  );
};
