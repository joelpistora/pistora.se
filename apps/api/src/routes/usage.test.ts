import assert from "node:assert/strict";
import { test } from "node:test";
import { makeAdminApp, makeAuthedApp, multipartBody } from "../test-helpers.js";

test("GET /api/usage reports the caller's quota and current footprint", async (t) => {
  const { app, cookie } = await makeAuthedApp(t, { defaultQuotaBytes: 5000 });

  const empty = await app.inject({ method: "GET", url: "/api/usage", headers: { cookie } });
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(empty.json(), { usedBytes: 0, quotaBytes: 5000 });

  const mb = multipartBody([{ filename: "a.bin", content: "x".repeat(1200) }]);
  const up = await app.inject({
    method: "POST",
    url: "/api/files/",
    payload: mb.payload,
    headers: { cookie, ...mb.headers },
  });
  assert.equal(up.statusCode, 201, up.payload);

  const after = await app.inject({ method: "GET", url: "/api/usage", headers: { cookie } });
  assert.deepEqual(after.json(), { usedBytes: 1200, quotaBytes: 5000 });
});

test("GET /api/usage for an admin is unlimited (quotaBytes: null)", async (t) => {
  const { app, cookie } = await makeAdminApp(t);
  const res = await app.inject({ method: "GET", url: "/api/usage", headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().quotaBytes, null);
});

test("GET /api/usage without a session is a 401", async (t) => {
  const { app } = await makeAuthedApp(t);
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/usage" })).statusCode,
    401,
  );
});
