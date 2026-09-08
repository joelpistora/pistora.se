import Fastify from "fastify";

const fastify = Fastify({
  logger: true,
});

fastify.get("/health", async () => {
  return { status: "ok" };
});

const port = Number(process.env.PORT) || 3001;

try {
  await fastify.listen({ port, host: "0.0.0.0" });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
