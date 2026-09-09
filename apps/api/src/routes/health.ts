import type { FastifyPluginAsync } from "fastify";

/** Liveness + connectivity probes. Moved verbatim from the original server.ts. */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    return { status: "ok" };
  });

  // Connectivity test endpoint — the timestamp makes it obvious the call reached
  // the live process and isn't a cached response.
  app.get("/api/ping", async () => {
    return { pong: true, at: new Date().toISOString(), from: "pistora-api" };
  });
};
