import fsp from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { PublicShareInfo, Share, ShareListResponse } from "shared";
import { generateSessionToken, generateUserId } from "../auth/crypto.js";
import {
  createShare,
  deleteShare,
  getShareById,
  getShareByToken,
  isExpired,
  listSharesByOwner,
  listSharesForRecipient,
  type ShareRow,
} from "../db/shares.js";
import { getUserByEmail, getUserById } from "../db/users.js";
import { listDirectory, normaliseRel, sendFile } from "../file-serve.js";
import { ensureUserDir, type Storage } from "../storage.js";

const errorResponses = {
  "4xx": { $ref: "error#" },
  "5xx": { $ref: "error#" },
};

/** The storage tree a share's path is relative to (mirrors the auth hook's scoping). */
function ownerStorage(app: FastifyInstance, row: ShareRow): Storage {
  const owner = getUserById(app.db, row.owner_id);
  if (!owner || owner.status === "disabled") throw app.httpErrors.notFound("share not found");
  return owner.role === "admin" ? app.storage : ensureUserDir(app.storage, owner.email);
}

async function typeOf(storage: Storage, rel: string): Promise<"file" | "directory"> {
  const s = await fsp.stat(storage.resolve(rel)).catch(() => null);
  return s?.isDirectory() ? "directory" : "file";
}

async function toShare(
  app: FastifyInstance,
  row: ShareRow,
  includeToken: boolean,
): Promise<Share> {
  return {
    id: row.id,
    path: row.path,
    name: path.posix.basename(row.path),
    type: await typeOf(ownerStorage(app, row), row.path),
    ownerEmail: row.owner_email,
    recipientEmail: row.recipient_email,
    token: includeToken ? row.token : null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/**
 * List or download `sub` inside the shared subtree. Rejects any `..` segment
 * outright (so a share of `a/b` can't reach `a/c`), then resolves the joined
 * path through the owner's `Storage` for the usual symlink/escape guarantees.
 */
async function serveShared(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  row: ShareRow,
  sub: string,
) {
  if (sub.split(/[\\/]/).includes("..")) {
    throw app.httpErrors.badRequest("invalid path");
  }
  const subRel = normaliseRel(sub);
  const storage = ownerStorage(app, row);
  const abs = storage.resolve(path.posix.join(row.path, subRel));
  const stats = await fsp.stat(abs).catch(() => null);
  if (!stats) throw app.httpErrors.notFound("no such path");

  if (stats.isDirectory()) return listDirectory(abs, subRel);
  const q = request.query as { download?: string };
  const download = q.download !== undefined && q.download !== "0" && q.download !== "false";
  return sendFile(reply, abs, stats, download);
}

const subOf = (request: FastifyRequest) =>
  (request.params as { "*"?: string })["*"] ?? "";

const createBody = {
  type: "object",
  required: ["path"],
  additionalProperties: false,
  properties: {
    path: { type: "string", minLength: 1, maxLength: 1024 },
    with: { type: "string", minLength: 3, maxLength: 320 },
    link: { type: "boolean" },
    expiresAt: { type: ["integer", "null"] },
  },
} as const;

/** Authenticated share management + recipient browsing. Mounted at `/api/shares`. */
export const shareRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/",
    { schema: { body: createBody, response: { "4xx": { $ref: "error#" }, "5xx": { $ref: "error#" } } } },
    async (request, reply) => {
      const body = request.body as {
        path: string;
        with?: string;
        link?: boolean;
        expiresAt?: number | null;
      };
      const user = request.user!;
      if (Boolean(body.with) === Boolean(body.link)) {
        throw app.httpErrors.badRequest('provide exactly one of "with" or "link": true');
      }
      const rel = normaliseRel(body.path);
      if (rel === "" || rel.split("/").includes("..")) {
        throw app.httpErrors.badRequest("choose a file or folder to share");
      }
      // Existence check through the caller's own scoped storage.
      const stat = await fsp.stat(request.storage.resolve(rel)).catch(() => null);
      if (!stat) throw app.httpErrors.notFound(`no such path: ${rel}`);

      const now = app.now();
      if (body.expiresAt != null && body.expiresAt <= now) {
        throw app.httpErrors.badRequest("expiry must be in the future");
      }

      let recipientId: string | null = null;
      if (body.with) {
        const recipient = getUserByEmail(app.db, body.with.trim().toLowerCase());
        if (!recipient || recipient.status !== "active") {
          throw app.httpErrors.notFound("no active user with that email");
        }
        if (recipient.id === user.id) {
          throw app.httpErrors.badRequest("you can't share with yourself");
        }
        recipientId = recipient.id;
      }

      const row = createShare(app.db, {
        id: generateUserId(),
        ownerId: user.id,
        path: rel,
        recipientId,
        token: body.link ? generateSessionToken() : null,
        now,
        expiresAt: body.expiresAt ?? null,
      });
      reply.code(201);
      return toShare(app, row, true);
    },
  );

  app.get(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: { direction: { type: "string", enum: ["by-me", "with-me"] } },
        },
        response: errorResponses,
      },
    },
    async (request): Promise<ShareListResponse> => {
      const user = request.user!;
      const { direction } = request.query as { direction?: "by-me" | "with-me" };
      if (direction === "with-me") {
        const rows = listSharesForRecipient(app.db, user.id, app.now());
        return { shares: await Promise.all(rows.map((r) => toShare(app, r, false))) };
      }
      const rows = listSharesByOwner(app.db, user.id);
      return { shares: await Promise.all(rows.map((r) => toShare(app, r, true))) };
    },
  );

  app.delete(
    "/:id",
    { schema: { response: { 204: { type: "null" }, ...errorResponses } } },
    async (request, reply) => {
      const row = getShareById(app.db, (request.params as { id: string }).id);
      // 404 (not 403) for someone else's share: don't confirm it exists.
      if (!row || row.owner_id !== request.user!.id) {
        throw app.httpErrors.notFound("share not found");
      }
      deleteShare(app.db, row.id);
      reply.code(204);
      return null;
    },
  );

  async function handleBrowse(request: FastifyRequest, reply: FastifyReply) {
    const row = getShareById(app.db, (request.params as { id: string }).id);
    const uid = request.user!.id;
    const allowed =
      row && (row.owner_id === uid || (row.recipient_id === uid && !isExpired(row, app.now())));
    if (!row || !allowed) throw app.httpErrors.notFound("share not found");
    return serveShared(app, request, reply, row, subOf(request));
  }
  const browseOpts = { schema: { response: errorResponses } };
  app.get("/:id/files", browseOpts, handleBrowse);
  app.get("/:id/files/*", browseOpts, handleBrowse);
};

/** Unauthenticated link access. Mounted at `/api/public`. */
export const publicShareRoutes: FastifyPluginAsync = async (app) => {
  function linkShare(request: FastifyRequest): ShareRow {
    const token = (request.params as { token: string }).token;
    const row = getShareByToken(app.db, token);
    if (!row || isExpired(row, app.now())) throw app.httpErrors.notFound("link not found");
    return row;
  }

  app.get("/:token", { schema: { response: errorResponses } }, async (request): Promise<PublicShareInfo> => {
    const row = linkShare(request);
    return {
      name: path.posix.basename(row.path),
      type: await typeOf(ownerStorage(app, row), row.path),
      expiresAt: row.expires_at,
    };
  });

  const opts = { schema: { response: errorResponses } };
  const handle = async (request: FastifyRequest, reply: FastifyReply) =>
    serveShared(app, request, reply, linkShare(request), subOf(request));
  app.get("/:token/files", opts, handle);
  app.get("/:token/files/*", opts, handle);
};
