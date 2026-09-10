import fsp from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";

/**
 * Directory creation, mounted at `/api/dirs`. Separate from `/api/files`
 * because a directory isn't a file resource and `mkdir -p` semantics don't fit
 * the file verbs.
 */
export const dirRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { "*": string } }>(
    "/*",
    {
      schema: {
        response: {
          201: {
            type: "object",
            required: ["path"],
            additionalProperties: false,
            properties: { path: { type: "string" } },
          },
          "4xx": { $ref: "error#" },
          "5xx": { $ref: "error#" },
        },
      },
    },
    async (request, reply) => {
      const rel = request.params["*"] ?? "";
      if (rel === "" || rel === ".") {
        throw app.httpErrors.badRequest("a directory name is required");
      }
      const abs = request.storage.resolve(rel);
      await fsp.mkdir(abs, { recursive: true });
      reply.code(201);
      return { path: rel };
    },
  );
};
