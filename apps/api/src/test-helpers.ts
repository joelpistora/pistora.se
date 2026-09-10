import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp, type BuildDeps } from "./app.js";
import type { AppConfig } from "./config.js";
import { createCaptureMailer } from "./mail/index.js";

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
