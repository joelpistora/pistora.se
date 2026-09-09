import type { FastifyError, FastifyInstance } from "fastify";

/**
 * One JSON error shape for the whole API: `{ error: { code, message, details? } }`.
 *
 * `code` is a stable, machine-readable slug the frontend can branch on:
 *   - `PathError` (storage.ts) carries its own (`path_escape`, `bad_path`, ...).
 *   - Fastify schema validation → `validation`.
 *   - `@fastify/sensible`'s `httpErrors.*` set only a status, so we map the
 *     status to a slug (`not_found`, `conflict`, `payload_too_large`, ...).
 *   - Anything 5xx → `internal`, and the message is swallowed so we don't leak
 *     internals (e.g. raw `ERR_FS_*` codes); the real error is logged.
 */
const STATUS_SLUGS: Record<number, string> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  409: "conflict",
  413: "payload_too_large",
  415: "unsupported_media_type",
  422: "unprocessable_entity",
  429: "too_many_requests",
};

/** A clean lowercase slug we're willing to pass through from `err.code`. */
const SLUG_RE = /^[a-z][a-z0-9_]*$/;

export function registerErrorHandler(app: FastifyInstance): void {
  app.addSchema({
    $id: "error",
    type: "object",
    required: ["error"],
    additionalProperties: false,
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          details: {},
        },
      },
    },
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err.validation) {
      return reply.code(400).send({
        error: {
          code: "validation",
          message: err.message,
          details: err.validation,
        },
      });
    }

    const status = err.statusCode ?? 500;

    if (status >= 500) {
      req.log.error(err);
      return reply.code(status).send({
        error: { code: "internal", message: "internal server error" },
      });
    }

    const code =
      typeof err.code === "string" && SLUG_RE.test(err.code)
        ? err.code
        : (STATUS_SLUGS[status] ?? "error");

    return reply.code(status).send({
      error: { code, message: err.message },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: {
        code: "not_found",
        message: `no route for ${req.method} ${req.url}`,
      },
    });
  });
}
