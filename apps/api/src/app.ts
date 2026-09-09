import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { registerErrorHandler } from "./http.js";
import { dirRoutes } from "./routes/dirs.js";
import { fileRoutes } from "./routes/files.js";
import { healthRoutes } from "./routes/health.js";
import { createStorage, type Storage } from "./storage.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    storage: Storage;
  }
}

/**
 * Build a fully-wired Fastify instance from a config object. Pure — no port
 * binding, no `process.env` — so tests can `buildApp()` with a temp storage
 * root and drive it via `app.inject()`.
 */
export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logger,
    // Non-multipart bodies stay small; file parts are governed by multipart's
    // own `limits.fileSize` below, not this.
    bodyLimit: 1 * 1024 * 1024,
  });

  app.decorate("config", config);
  app.decorate("storage", createStorage(config.storageRoot));

  await app.register(cors, {
    origin: config.corsOrigins,
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

  await app.register(healthRoutes);
  await app.register(fileRoutes, { prefix: "/api/files" });
  await app.register(dirRoutes, { prefix: "/api/dirs" });

  return app;
}
