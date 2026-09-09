import type { FastifyError, FastifyInstance } from "fastify";

/**
 * One JSON error shape for the whole API: `{ error: { code, message, details? } }`.
 * Route code throws either a `PathError` (from storage.ts) or one of
 * `@fastify/sensible`'s `httpErrors.*` — both carry `statusCode` + `code`, so
 * this handler just formats them. 5xx messages are swallowed to avoid leaking
 * internals; the real error is logged.
 */
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
    const code = err.code ?? (status >= 500 ? "internal" : "error");

    if (status >= 500) {
      req.log.error(err);
    }

    return reply.code(status).send({
      error: {
        code,
        message: status >= 500 ? "internal server error" : err.message,
      },
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
