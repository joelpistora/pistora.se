import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";
import { ensureAdminUser } from "./auth/bootstrap.js";
import { makeAuthHook } from "./auth/hook.js";
import type { AppConfig } from "./config.js";
import { openDb, type DatabaseSync } from "./db/index.js";
import { deleteExpiredSessions } from "./db/sessions.js";
import { registerErrorHandler } from "./http.js";
import { createConsoleMailer, type Mailer } from "./mail/index.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { dirRoutes } from "./routes/dirs.js";
import { fileRoutes } from "./routes/files.js";
import { healthRoutes } from "./routes/health.js";
import { usageRoutes } from "./routes/usage.js";
import { createStorage, type Storage } from "./storage.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    storage: Storage;
    db: DatabaseSync;
    mailer: Mailer;
    /** Injectable clock (epoch ms). Tests override it to drive session/OTP expiry. */
    now: () => number;
  }
}

/** Optional collaborators `buildApp` takes so tests can supply fakes. */
export interface BuildDeps {
  mailer?: Mailer;
  now?: () => number;
}

/**
 * Build a fully-wired Fastify instance from a config object. Pure — no port
 * binding, no `process.env` — so tests can `buildApp()` with a temp storage
 * root and drive it via `app.inject()`.
 */
export async function buildApp(
  config: AppConfig,
  deps: BuildDeps = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logger,
    // Non-multipart bodies stay small; file parts are governed by multipart's
    // own `limits.fileSize` below, not this.
    bodyLimit: 1 * 1024 * 1024,
  });

  app.decorate("config", config);
  app.decorate("storage", createStorage(config.storageRoot));
  app.decorate("now", deps.now ?? Date.now);
  app.decorateRequest("user", null);
  // Always assigned by the guarded scope's hook before any handler runs; the
  // `null` default is a placeholder the open routes never read.
  app.decorateRequest("storage", null as unknown as Storage);

  const db = openDb(config.dbPath);
  app.decorate("db", db);
  app.decorate("mailer", deps.mailer ?? createConsoleMailer(app.log));
  app.addHook("onClose", () => {
    db.close();
  });
  deleteExpiredSessions(db, app.now());

  await app.register(cookie);
  await app.register(cors, {
    origin: config.corsOrigins,
    // @fastify/cors defaults to GET,HEAD,POST — spell out the rest so the
    // browser's preflight for PATCH (admin) and DELETE (files) passes.
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE"],
    // Session cookie rides on cross-origin fetch() from the web app.
    credentials: true,
    // Let browser fetch() read these off download responses (cross-origin
    // reads are opaque otherwise).
    exposedHeaders: [
      "Content-Disposition",
      "Content-Length",
      "Content-Type",
      "Last-Modified",
    ],
  });
  await app.register(sensible);
  await app.register(multipart, {
    limits: {
      fileSize: config.maxFileBytes,
      files: config.maxFilesPerUpload,
      fields: 10,
    },
  });

  registerErrorHandler(app);
  await ensureAdminUser(app);

  // Open routes.
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/api/auth" });

  // Guarded scope: everything here requires a valid session. Fastify
  // encapsulation keeps the hook local to this register() call.
  await app.register(async (secure) => {
    secure.addHook("onRequest", makeAuthHook(secure, { scopeStorage: true }));
    await secure.register(fileRoutes, { prefix: "/api/files" });
    await secure.register(dirRoutes, { prefix: "/api/dirs" });
    await secure.register(adminRoutes, { prefix: "/api/admin" });
    await secure.register(usageRoutes, { prefix: "/api" });
  });

  return app;
}
