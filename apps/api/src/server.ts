import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

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

const app = await buildApp(config);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
