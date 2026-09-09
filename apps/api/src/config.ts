import fs from "node:fs";
import path from "node:path";

/**
 * Fully-resolved runtime configuration. `buildApp()` takes one of these and
 * never reads `process.env` itself — that keeps tests hermetic (each test hands
 * in its own config with a fresh temp `storageRoot`).
 */
export interface AppConfig {
  port: number;
  host: string;
  /** Absolute path, verified at load time to be an existing directory. */
  storageRoot: string;
  /** Per-file upload ceiling, bytes. */
  maxFileBytes: number;
  /** Max files accepted in a single multipart upload request. */
  maxFilesPerUpload: number;
  corsOrigins: string[];
  logger: boolean;
}

const DEFAULT_CORS_ORIGINS = [
  "https://pistora.se",
  "https://www.pistora.se",
  "http://localhost:3000",
];

const GiB = 1024 * 1024 * 1024;

/**
 * Parse and validate configuration from the environment. Throws with an
 * actionable message if `STORAGE_ROOT` is missing or does not point at a
 * directory — the process should exit rather than serve from nowhere.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const raw = env.STORAGE_ROOT?.trim();
  if (!raw) {
    throw new Error(
      "STORAGE_ROOT is required — set it in apps/api/.env (see apps/api/env.example)",
    );
  }

  const storageRoot = path.resolve(raw);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(storageRoot);
  } catch {
    throw new Error(`STORAGE_ROOT does not exist: ${storageRoot}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`STORAGE_ROOT is not a directory: ${storageRoot}`);
  }

  return {
    port: Number(env.PORT) || 3001,
    host: env.HOST?.trim() || "0.0.0.0",
    storageRoot,
    maxFileBytes: Number(env.MAX_FILE_BYTES) || 5 * GiB,
    maxFilesPerUpload: Number(env.MAX_FILES_PER_UPLOAD) || 20,
    corsOrigins:
      env.CORS_ORIGINS?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? DEFAULT_CORS_ORIGINS,
    logger: env.LOG !== "off",
  };
}
