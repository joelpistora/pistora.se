import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parseRange } from "../file-serve.js";
import { makeAuthedApp } from "../test-helpers.js";

test("parseRange: forms, clamping and invalid ranges", () => {
  assert.deepEqual(parseRange("bytes=0-3", 10), { start: 0, end: 3 });
  assert.deepEqual(parseRange("bytes=4-", 10), { start: 4, end: 9 });
  assert.deepEqual(parseRange("bytes=-3", 10), { start: 7, end: 9 });
  assert.deepEqual(parseRange("bytes=-99", 10), { start: 0, end: 9 });
  assert.deepEqual(parseRange("bytes=5-99", 10), { start: 5, end: 9 });
  assert.equal(parseRange("bytes=10-", 10), "invalid");
  assert.equal(parseRange("bytes=5-2", 10), "invalid");
  assert.equal(parseRange("bytes=-0", 10), "invalid");
  assert.equal(parseRange("bytes=0-1,3-4", 10), null); // multi-range → full body
  assert.equal(parseRange("items=0-1", 10), null);
  assert.equal(parseRange(undefined, 10), null);
});

test("GET supports Range: 206 partial, 416 out of range, full body otherwise", async (t) => {
  const { app, userDir, cookie } = await makeAuthedApp(t);
  fs.writeFileSync(path.join(userDir, "digits.txt"), "0123456789");
  const get = (headers: Record<string, string> = {}) =>
    app.inject({ method: "GET", url: "/api/files/digits.txt", headers: { cookie, ...headers } });

  const full = await get();
  assert.equal(full.statusCode, 200);
  assert.equal(full.headers["accept-ranges"], "bytes");
  assert.equal(full.payload, "0123456789");

  const part = await get({ range: "bytes=2-5" });
  assert.equal(part.statusCode, 206);
  assert.equal(part.payload, "2345");
  assert.equal(part.headers["content-range"], "bytes 2-5/10");
  assert.equal(part.headers["content-length"], "4");

  const tail = await get({ range: "bytes=-3" });
  assert.equal(tail.statusCode, 206);
  assert.equal(tail.payload, "789");

  const bad = await get({ range: "bytes=50-60" });
  assert.equal(bad.statusCode, 416);
  assert.equal(bad.headers["content-range"], "bytes */10");
  assert.equal(bad.json().error.code, "range_not_satisfiable");

  // If-Range with a stale validator ignores Range.
  const stale = await get({ range: "bytes=0-1", "if-range": "Thu, 01 Jan 1970 00:00:00 GMT" });
  assert.equal(stale.statusCode, 200);
  assert.equal(stale.payload, "0123456789");
  const fresh = await get({ range: "bytes=0-1", "if-range": full.headers["last-modified"] as string });
  assert.equal(fresh.statusCode, 206);
});

test("shared downloads honour Range too", async (t) => {
  const { app, userDir, cookie } = await makeAuthedApp(t);
  fs.writeFileSync(path.join(userDir, "m.bin"), "abcdefghij");
  const res = await app.inject({
    method: "POST", url: "/api/shares", headers: { cookie },
    payload: { path: "m.bin", link: true },
  });
  const { token } = res.json() as { token: string };
  const part = await app.inject({
    method: "GET", url: `/api/public/${token}/files`, headers: { range: "bytes=1-3" },
  });
  assert.equal(part.statusCode, 206);
  assert.equal(part.payload, "bcd");
});
