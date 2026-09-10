import fsp from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";
import type {
  AdminUser,
  AdminUserListResponse,
  CreateUserResponse,
  Role,
  UserStatus,
} from "shared";
import { generateOtp, generateUserId, hashPassword } from "../auth/crypto.js";
import { deleteSessionsForUser } from "../db/sessions.js";
import {
  countAdmins,
  createUser,
  deleteUser,
  getUserByEmail,
  getUserById,
  issueOtp,
  listUsers,
  setQuota,
  setRole,
  setStatus,
  type UserRow,
} from "../db/users.js";
import { ensureUserDir } from "../storage.js";

/** Hard cap on a per-user quota an admin can set — a sanity limit, not a disk check. */
const MAX_QUOTA_BYTES = 5 * 1024 * 1024 * 1024 * 1024; // 5 TiB

/** How long an invited / reset one-time password stays usable. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toAdminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    mustChangePassword: row.must_change_password,
    quotaBytes: row.quota_bytes,
    createdAt: new Date(row.created_at).toISOString(),
    lastLoginAt:
      row.last_login_at == null ? null : new Date(row.last_login_at).toISOString(),
  };
}

const adminUserSchema = {
  type: "object",
  required: [
    "id", "email", "role", "status", "mustChangePassword", "quotaBytes",
    "createdAt", "lastLoginAt",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    email: { type: "string" },
    role: { type: "string", enum: ["admin", "user"] },
    status: { type: "string", enum: ["active", "disabled"] },
    mustChangePassword: { type: "boolean" },
    quotaBytes: { type: "integer" },
    createdAt: { type: "string" },
    lastLoginAt: { type: ["string", "null"] },
  },
} as const;

const createBodySchema = {
  type: "object",
  required: ["email"],
  additionalProperties: false,
  properties: {
    email: { type: "string", minLength: 3, maxLength: 320 },
    role: { type: "string", enum: ["admin", "user"] },
  },
} as const;

const patchBodySchema = {
  type: "object",
  minProperties: 1,
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["active", "disabled"] },
    role: { type: "string", enum: ["admin", "user"] },
    quotaBytes: { type: "integer", minimum: 0, maximum: MAX_QUOTA_BYTES },
  },
} as const;

const errorResponses = {
  "4xx": { $ref: "error#" },
  "5xx": { $ref: "error#" },
} as const;

/**
 * `/api/admin/*` — mounted inside the guarded scope, so the caller is already an
 * authenticated non-must-change user by the time these run. A plugin-wide
 * preHandler narrows that to admins.
 */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req) => {
    if (req.user?.role !== "admin") {
      throw app.httpErrors.forbidden("admin access required");
    }
  });

  // ---- GET /api/admin/users ---------------------------------------------

  app.get(
    "/users",
    {
      schema: {
        response: {
          200: {
            type: "object",
            required: ["users"],
            additionalProperties: false,
            properties: { users: { type: "array", items: adminUserSchema } },
          },
          ...errorResponses,
        },
      },
    },
    async (): Promise<AdminUserListResponse> => {
      return { users: listUsers(app.db).map(toAdminUser) };
    },
  );

  // ---- POST /api/admin/users -------------------------------------------

  app.post<{ Body: { email: string; role?: Role } }>(
    "/users",
    {
      schema: {
        body: createBodySchema,
        response: {
          201: {
            type: "object",
            required: ["user"],
            additionalProperties: false,
            properties: { user: adminUserSchema, otp: { type: "string" } },
          },
          ...errorResponses,
        },
      },
    },
    async (req, reply): Promise<CreateUserResponse> => {
      const email = req.body.email.trim().toLowerCase();
      if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
        throw app.httpErrors.badRequest("a valid email address is required");
      }
      if (getUserByEmail(app.db, email)) {
        throw app.httpErrors.conflict("a user with that email already exists");
      }

      const id = generateUserId();
      const otp = generateOtp();
      const now = app.now();
      const role: Role = req.body.role ?? "user";

      // Provision the folder before the row exists: a mailer failure then can't
      // leave an un-provisioned account behind. Admins browse the root, so they
      // get no personal folder.
      if (role !== "admin") ensureUserDir(app.storage, email);
      createUser(app.db, {
        id,
        email,
        role,
        passwordHash: hashPassword(otp),
        mustChangePassword: true,
        passwordExpiresAt: now + INVITE_TTL_MS,
        quotaBytes: app.config.defaultQuotaBytes,
        now,
      });

      await app.mailer.sendInvite({ to: email, otp });

      reply.code(201);
      const user = toAdminUser(getUserById(app.db, id)!);
      return app.config.exposeInviteOtp ? { user, otp } : { user };
    },
  );

  // ---- PATCH /api/admin/users/:id -------------------------------------

  app.patch<{
    Params: { id: string };
    Body: { status?: UserStatus; role?: Role; quotaBytes?: number };
  }>(
    "/users/:id",
    {
      schema: {
        body: patchBodySchema,
        response: {
          200: {
            type: "object",
            required: ["user"],
            additionalProperties: false,
            properties: { user: adminUserSchema },
          },
          ...errorResponses,
        },
      },
    },
    async (req): Promise<{ user: AdminUser }> => {
      const target = getUserById(app.db, req.params.id);
      if (!target) throw app.httpErrors.notFound("no such user");

      const nextRole: Role = req.body.role ?? target.role;
      const nextStatus: UserStatus = req.body.status ?? target.status;
      const wasActiveAdmin = target.role === "admin" && target.status === "active";
      const willBeActiveAdmin = nextRole === "admin" && nextStatus === "active";

      if (wasActiveAdmin && !willBeActiveAdmin) {
        if (target.id === req.user!.id) {
          throw app.httpErrors.conflict(
            "you cannot remove your own admin access or disable yourself",
          );
        }
        if (countAdmins(app.db, { activeOnly: true }) <= 1) {
          throw app.httpErrors.conflict("at least one active admin is required");
        }
      }

      const now = app.now();
      if (req.body.role && req.body.role !== target.role) {
        setRole(app.db, target.id, req.body.role, now);
      }
      if (req.body.status && req.body.status !== target.status) {
        setStatus(app.db, target.id, req.body.status, now);
        if (req.body.status === "disabled") {
          deleteSessionsForUser(app.db, target.id);
        }
      }
      if (req.body.quotaBytes != null && req.body.quotaBytes !== target.quota_bytes) {
        setQuota(app.db, target.id, req.body.quotaBytes, now);
      }

      return { user: toAdminUser(getUserById(app.db, target.id)!) };
    },
  );

  // ---- POST /api/admin/users/:id/reset-otp ---------------------------

  app.post<{ Params: { id: string } }>(
    "/users/:id/reset-otp",
    {
      schema: {
        response: {
          200: {
            type: "object",
            required: ["user"],
            additionalProperties: false,
            properties: { user: adminUserSchema, otp: { type: "string" } },
          },
          ...errorResponses,
        },
      },
    },
    async (req): Promise<CreateUserResponse> => {
      const target = getUserById(app.db, req.params.id);
      if (!target) throw app.httpErrors.notFound("no such user");

      const otp = generateOtp();
      const now = app.now();
      issueOtp(app.db, target.id, hashPassword(otp), now + INVITE_TTL_MS, now);
      deleteSessionsForUser(app.db, target.id);
      await app.mailer.sendInvite({ to: target.email, otp });

      const user = toAdminUser(getUserById(app.db, target.id)!);
      return app.config.exposeInviteOtp ? { user, otp } : { user };
    },
  );

  // ---- DELETE /api/admin/users/:id ----------------------------------

  app.delete<{ Params: { id: string } }>(
    "/users/:id",
    {
      schema: {
        response: {
          204: { type: "null" },
          ...errorResponses,
        },
      },
    },
    async (req, reply) => {
      const target = getUserById(app.db, req.params.id);
      if (!target) throw app.httpErrors.notFound("no such user");
      if (target.id === req.user!.id) {
        throw app.httpErrors.conflict("you cannot delete your own account");
      }
      if (
        target.role === "admin" &&
        target.status === "active" &&
        countAdmins(app.db, { activeOnly: true }) <= 1
      ) {
        throw app.httpErrors.conflict("at least one active admin is required");
      }

      deleteSessionsForUser(app.db, target.id);
      deleteUser(app.db, target.id);

      // Remove the user's folder and everything in it. Scoped to exactly
      // `users/<email>/` (their own dedicated space) — `forUser` validates the
      // key and returns a realpath'd absolute path, or throws if there's no
      // folder (e.g. an admin, who has none).
      try {
        await fsp.rm(app.storage.forUser(target.email).root, {
          recursive: true,
          force: true,
        });
      } catch {
        // no folder to remove — fine
      }

      reply.code(204);
      return null;
    },
  );
};
