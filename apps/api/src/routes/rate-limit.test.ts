import assert from "node:assert/strict";
import { test } from "node:test";
import { makeApp, seedUser } from "../test-helpers.js";

const login = (app: Awaited<ReturnType<typeof makeApp>>["app"], headers = {}) =>
  app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers,
    payload: { email: "nobody@pistora.test", password: "wrong-password" },
  });

test("auth POSTs are capped per IP and return the 429 envelope + Retry-After", async (t) => {
  const { app } = await makeApp(t, { rateLimitAuthMax: 3 });
  for (let i = 0; i < 3; i++) assert.equal((await login(app)).statusCode, 401);
  const blocked = await login(app);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.json().error.code, "too_many_requests");
  assert.ok(blocked.headers["retry-after"]);
});

test("GET /api/auth/me and /health don't count toward the auth cap", async (t) => {
  const { app } = await makeApp(t, { rateLimitAuthMax: 2, rateLimitMax: 1000 });
  for (let i = 0; i < 6; i++) {
    assert.equal((await app.inject({ method: "GET", url: "/api/auth/me" })).statusCode, 401);
  }
  assert.equal((await login(app)).statusCode, 401);
});

test("global cap applies to the rest of the API; health is exempt", async (t) => {
  const { app } = await makeApp(t, { rateLimitMax: 3 });
  for (let i = 0; i < 3; i++) {
    assert.equal((await app.inject({ method: "GET", url: "/api/files" })).statusCode, 401);
  }
  assert.equal((await app.inject({ method: "GET", url: "/api/files" })).statusCode, 429);
  assert.equal((await app.inject({ method: "GET", url: "/health" })).statusCode, 200);
});

test("trustProxy keys on CF-Connecting-IP; without it the header is ignored", async (t) => {
  const on = await makeApp(t, { rateLimitAuthMax: 1, trustProxy: true });
  assert.equal((await login(on.app, { "cf-connecting-ip": "1.1.1.1" })).statusCode, 401);
  assert.equal((await login(on.app, { "cf-connecting-ip": "2.2.2.2" })).statusCode, 401);
  assert.equal((await login(on.app, { "cf-connecting-ip": "1.1.1.1" })).statusCode, 429);

  const off = await makeApp(t, { rateLimitAuthMax: 1 });
  assert.equal((await login(off.app, { "cf-connecting-ip": "1.1.1.1" })).statusCode, 401);
  assert.equal((await login(off.app, { "cf-connecting-ip": "2.2.2.2" })).statusCode, 429);
});
