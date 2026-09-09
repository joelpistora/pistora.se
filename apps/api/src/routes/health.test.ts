import assert from "node:assert/strict";
import { test } from "node:test";
import { makeApp } from "../test-helpers.js";

test("GET /health returns ok", async (t) => {
  const { app } = await makeApp(t);
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: "ok" });
});

test("GET /api/ping returns the probe shape", async (t) => {
  const { app } = await makeApp(t);
  const res = await app.inject({ method: "GET", url: "/api/ping" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.pong, true);
  assert.equal(body.from, "pistora-api");
  assert.ok(!Number.isNaN(Date.parse(body.at)));
});
