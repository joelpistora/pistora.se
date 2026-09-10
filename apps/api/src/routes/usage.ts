import type { FastifyPluginAsync } from "fastify";
import type { UsageResponse } from "shared";
import { dirSize } from "../fs-usage.js";

/**
 * `GET /api/usage` — the caller's own storage footprint, for the file-browser
 * quota bar. Admins get `quotaBytes: null` and no walk (their root is the whole
 * drive). Mounted in the guarded scope, so `request.storage` / `request.user`
 * are set.
 */
export const usageRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/usage",
    {
      schema: {
        response: {
          200: {
            type: "object",
            required: ["usedBytes", "quotaBytes"],
            additionalProperties: false,
            properties: {
              usedBytes: { type: "integer" },
              quotaBytes: { type: ["integer", "null"] },
            },
          },
          "4xx": { $ref: "error#" },
          "5xx": { $ref: "error#" },
        },
      },
    },
    async (request): Promise<UsageResponse> => {
      if (request.user!.role === "admin") {
        return { usedBytes: 0, quotaBytes: null };
      }
      return {
        usedBytes: await dirSize(request.storage.root),
        quotaBytes: request.user!.quotaBytes,
      };
    },
  );
};
