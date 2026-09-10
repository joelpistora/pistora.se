import fs from "node:fs";
import path from "node:path";
import { DEFAULT_QUOTA_BYTES } from "./db/schema.js";

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
  /** Passed straight to `@fastify/cors` `origin` — strings and/or RegExps. */
  corsOrigins: (string | RegExp)[];
  logger: boolean;

  // ---- auth ----------------------------------------------------------------
  /** SQLite file for the auth datastore, or `":memory:"` in tests. Dir is created if missing. */
  dbPath: string;
  /** How long a login session stays valid. */
  sessionTtlHours: number;
  /** Bootstrap admin identity — a row with this email + `role: "admin"` is ensured at startup. */
  adminEmail: string;
  /** Session cookie name. Not `__Host-` prefixed so it still works over http in local dev. */
  cookieName: string;
  /** `Secure` attribute on the session cookie. Set `COOKIE_SECURE=false` for local http. */
  cookieSecure: boolean;
  /** `Domain` attribute, or undefined for a host-only cookie (the right default on api.pistora.se). */
  cookieDomain: string | undefined;
  /** When true, `POST /api/admin/users` echoes the generated OTP in the response body (dev only). */
  exposeInviteOtp: boolean;
  /** Quota (bytes) a newly invited user starts with. Admins can change it per user afterwards. */
  defaultQuotaBytes: number;
}

const DEFAULT_CORS_ORIGINS = ["https://pistora.se", "https://www.pistora.se"];

/**
 * Any loopback origin, on any port. Added to the default allowlist so a local
 * `npm run dev` works whatever port Next lands on (it bumps to 3001, 3002, …
 * when 3000 is taken). Dropped when `CORS_ORIGINS` is set explicitly (prod).
 */
const LOOPBACK_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
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

  const adminEmail = env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    throw new Error(
      "ADMIN_EMAIL is required — the bootstrap admin account (see apps/api/env.example)",
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
    corsOrigins: env.CORS_ORIGINS
      ? env.CORS_ORIGINS.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [...DEFAULT_CORS_ORIGINS, ...LOOPBACK_ORIGINS],
    logger: env.LOG !== "off",

    dbPath: env.DB_PATH?.trim() || path.resolve("data/pistora.db"),
    sessionTtlHours: Number(env.SESSION_TTL_HOURS) || 720,
    adminEmail,
    cookieName: "pistora_session",
    cookieSecure: env.COOKIE_SECURE?.trim().toLowerCase() !== "false",
    cookieDomain: env.COOKIE_DOMAIN?.trim() || undefined,
    exposeInviteOtp: env.EXPOSE_INVITE_OTP?.trim().toLowerCase() === "true",
    defaultQuotaBytes:
      Number(env.DEFAULT_USER_QUOTA_BYTES) || DEFAULT_QUOTA_BYTES,
  };
}
