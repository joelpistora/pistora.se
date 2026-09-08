import Fastify from "fastify";
import cors from "@fastify/cors";

const fastify = Fastify({
  logger: true,
});

// The static frontend on pistora.se is a different origin from this API, so the
// browser needs an explicit allowlist to read our responses. `www` included
// because the domain serves both; localhost:3000 for the Next.js dev server.
await fastify.register(cors, {
  origin: [
    "https://pistora.se",
    "https://www.pistora.se",
    "http://localhost:3000",
  ],
});

fastify.get("/health", async () => {
  return { status: "ok" };
});

// Connectivity test endpoint — the timestamp makes it obvious the call reached
// the live process and isn't a cached response.
fastify.get("/api/ping", async () => {
  return { pong: true, at: new Date().toISOString(), from: "pistora-api" };
});

const port = Number(process.env.PORT) || 3001;

try {
  await fastify.listen({ port, host: "0.0.0.0" });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
