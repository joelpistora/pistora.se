import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { makeAuthedApp } from "../test-helpers.js";

test("POST /api/dirs/* creates nested directories under the caller's root", async (t) => {
  const { app, userDir, cookie } = await makeAuthedApp(t);
  const res = await app.inject({
    method: "POST",
    url: "/api/dirs/photos/2026",
    headers: { cookie },
  });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json(), { path: "photos/2026" });
  assert.ok(fs.statSync(path.join(userDir, "photos/2026")).isDirectory());
});

test("POST /api/dirs/* is idempotent", async (t) => {
  const { app, cookie } = await makeAuthedApp(t);
  await app.inject({ method: "POST", url: "/api/dirs/a/b", headers: { cookie } });
  const res = await app.inject({ method: "POST", url: "/api/dirs/a/b", headers: { cookie } });
  assert.equal(res.statusCode, 201);
});

test("POST /api/dirs/ (no name) is a 400", async (t) => {
  const { app, cookie } = await makeAuthedApp(t);
  const res = await app.inject({ method: "POST", url: "/api/dirs/", headers: { cookie } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, "bad_request");
});

test("POST /api/dirs/* rejects traversal", async (t) => {
  const { app, cookie } = await makeAuthedApp(t);
  const res = await app.inject({
    method: "POST",
    url: "/api/dirs/" + encodeURIComponent("../escape"),
    headers: { cookie },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error.code, "path_escape");
});

test("POST /api/dirs/* without a session is a 401", async (t) => {
  const { app } = await makeAuthedApp(t);
  const res = await app.inject({ method: "POST", url: "/api/dirs/x" });
  assert.equal(res.statusCode, 401);
});
