import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp, type BuildDeps } from "./app.js";
import { generateUserId, hashPassword } from "./auth/crypto.js";
import type { AppConfig } from "./config.js";
import { createUser } from "./db/users.js";
import { createCaptureMailer } from "./mail/index.js";
import type { Role, UserStatus } from "shared";
import { ensureUserDir } from "./storage.js";

type CaptureMailer = ReturnType<typeof createCaptureMailer>;

/**
 * Build an app backed by a fresh temp storage root and a private in-memory
 * database, torn down after the test. `loadConfig()` never runs here — the
 * config is handed in directly, which is what keeps tests isolated and
 * parallel-safe. The mailer is a capture double unless `deps.mailer` is given.
 */
export async function makeApp(
  t: TestContext,
  overrides: Partial<AppConfig> = {},
  deps: BuildDeps = {},
): Promise<{ app: FastifyInstance; root: string; mailer: CaptureMailer }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pistora-test-"));
  const mailer = (deps.mailer as CaptureMailer | undefined) ?? createCaptureMailer();
  const app = await buildApp(
    {
      port: 0,
      host: "127.0.0.1",
      storageRoot: root,
      maxFileBytes: 10 * 1024 * 1024,
      maxFilesPerUpload: 5,
      corsOrigins: ["http://localhost:3000"],
      logger: false,
      dbPath: ":memory:",
      sessionTtlHours: 720,
      adminEmail: "admin@pistora.test",
      cookieName: "pistora_session",
      cookieSecure: false,
      cookieDomain: undefined,
      exposeInviteOtp: false,
      defaultQuotaBytes: 1024 * 1024 * 1024,
      ...overrides,
    },
    { mailer, ...deps },
  );

  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  return { app, root, mailer };
}

interface SeedUserInput {
  email: string;
  password?: string;
  role?: Role;
  status?: UserStatus;
  /** Default false — pass true to simulate a fresh invite that hasn't set a password. */
  mustChange?: boolean;
  /** epoch ms; only relevant with mustChange. */
  passwordExpiresAt?: number | null;
  /** Upload ceiling in bytes; defaults to the config default (1 GiB). */
  quotaBytes?: number;
}

/** Insert a user straight through the DAO and provision their folder (non-admins). */
export function seedUser(
  app: FastifyInstance,
  input: SeedUserInput,
): { id: string; email: string; password: string } {
  const id = generateUserId();
  const email = input.email.trim().toLowerCase();
  const role = input.role ?? "user";
  const password = input.password ?? "test-password-123";
  if (role !== "admin") ensureUserDir(app.storage, email);
  createUser(app.db, {
    id,
    email,
    role,
    passwordHash: hashPassword(password),
    mustChangePassword: input.mustChange ?? false,
    passwordExpiresAt: input.passwordExpiresAt ?? null,
    quotaBytes: input.quotaBytes ?? app.config.defaultQuotaBytes,
    now: app.now(),
  });
  if (input.status && input.status !== "active") {
    app.db
      .prepare("UPDATE users SET status = ? WHERE id = ?")
      .run(input.status, id);
  }
  return { id, email, password };
}

/** Log in and return the `name=value` cookie string to hand back as a `cookie` header. */
export async function loginCookie(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password },
  });
  assert.equal(res.statusCode, 200, res.payload);
  const raw = res.headers["set-cookie"];
  const header = Array.isArray(raw) ? raw[0]! : raw!;
  return header.split(";")[0]!;
}

/**
 * `makeApp` + one seeded active non-admin user, already logged in. Returns the
 * cookie plus that user's id and on-disk folder for path assertions.
 */
export async function makeAuthedApp(
  t: TestContext,
  overrides: Partial<AppConfig> = {},
): Promise<{
  app: FastifyInstance;
  root: string;
  mailer: CaptureMailer;
  userId: string;
  userDir: string;
  cookie: string;
}> {
  const { app, root, mailer } = await makeApp(t, overrides);
  const user = seedUser(app, { email: "user@pistora.test" });
  const cookie = await loginCookie(app, user.email, user.password);
  return {
    app,
    root,
    mailer,
    userId: user.id,
    userDir: path.join(root, "users", user.email),
    cookie,
  };
}

/**
 * `makeApp` reset to a known-empty user table, then one seeded active admin,
 * logged in. Drops the bootstrap admin so list/count assertions start clean.
 */
export async function makeAdminApp(
  t: TestContext,
  overrides: Partial<AppConfig> = {},
): Promise<{
  app: FastifyInstance;
  root: string;
  mailer: CaptureMailer;
  adminId: string;
  cookie: string;
}> {
  const { app, root, mailer } = await makeApp(t, overrides);
  app.db.prepare("DELETE FROM users").run();
  mailer.sent.length = 0;
  const admin = seedUser(app, { email: "admin@pistora.test", role: "admin" });
  const cookie = await loginCookie(app, admin.email, admin.password);
  return { app, root, mailer, adminId: admin.id, cookie };
}

interface FilePart {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

/**
 * Hand-build a `multipart/form-data` body for `app.inject()`. `light-my-request`
 * doesn't serialise the global `FormData`, so this keeps upload tests on inject
 * rather than a real socket.
 */
export function multipartBody(files: FilePart[]): {
  payload: Buffer;
  headers: Record<string, string>;
} {
  const boundary = `----pistoraTest${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];

  for (const file of files) {
    const body = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content);
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
          `Content-Type: ${file.contentType ?? "application/octet-stream"}\r\n\r\n`,
      ),
      body,
      Buffer.from("\r\n"),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  const payload = Buffer.concat(chunks);
  return {
    payload,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(payload.length),
    },
  };
}
