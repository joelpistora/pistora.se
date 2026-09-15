import type { BuildDeps } from "./app.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createResendMailer } from "./mail/resend.js";

// Load apps/api/.env when present. `npm run dev:api` runs with cwd = apps/api,
// so this finds the developer-local .env; in production the env is set directly.
try {
  process.loadEnvFile();
} catch {
  // no .env file — fine, rely on the real environment
}

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`config error: ${(err as Error).message}`);
  process.exit(1);
}

// Real email transport is opt-in — unset MAILER keeps the ConsoleMailer
// (buildApp's own default) that just logs. `console` stands in for the
// Fastify logger here since it doesn't exist yet at this point.
const deps: BuildDeps = {};
if (process.env.MAILER?.trim().toLowerCase() === "resend") {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!apiKey || !from) {
    console.error(
      "MAILER=resend requires RESEND_API_KEY and MAIL_FROM (see apps/api/env.example)",
    );
    process.exit(1);
  }
  deps.mailer = createResendMailer({ apiKey, from, log: console });
}

const app = await buildApp(config, deps);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
