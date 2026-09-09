import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { makeApp } from "../test-helpers.js";

test("POST /api/dirs/* creates nested directories", async (t) => {
  const { app, root } = await makeApp(t);
  const res = await app.inject({ method: "POST", url: "/api/dirs/photos/2026" });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json(), { path: "photos/2026" });
  assert.ok(fs.statSync(path.join(root, "photos/2026")).isDirectory());
});

test("POST /api/dirs/* is idempotent", async (t) => {
  const { app } = await makeApp(t);
  await app.inject({ method: "POST", url: "/api/dirs/a/b" });
  const res = await app.inject({ method: "POST", url: "/api/dirs/a/b" });
  assert.equal(res.statusCode, 201);
});

test("POST /api/dirs/ (no name) is a 400", async (t) => {
  const { app } = await makeApp(t);
  const res = await app.inject({ method: "POST", url: "/api/dirs/" });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, "error");
});

test("POST /api/dirs/* rejects traversal", async (t) => {
  const { app } = await makeApp(t);
  const res = await app.inject({
    method: "POST",
    url: "/api/dirs/" + encodeURIComponent("../escape"),
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error.code, "path_escape");
});
