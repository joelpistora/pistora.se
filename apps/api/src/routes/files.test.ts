import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { FastifyInstance, InjectOptions } from "fastify";
import { makeApp, makeAuthedApp, multipartBody } from "../test-helpers.js";

/** An `app.inject` bound to a session cookie — every file/dir route needs one now. */
function client(app: FastifyInstance, cookie: string) {
  return (opts: InjectOptions) =>
    app.inject({ ...opts, headers: { cookie, ...opts.headers } });
}

async function seedFile(
  inject: ReturnType<typeof client>,
  dir: string,
  filename: string,
  content: string,
) {
  if (dir) await inject({ method: "POST", url: `/api/dirs/${dir}` });
  const { payload, headers } = multipartBody([{ filename, content }]);
  const url = dir ? `/api/files/${dir}` : "/api/files";
  const res = await inject({ method: "POST", url, payload, headers });
  assert.equal(res.statusCode, 201, res.payload);
  return res;
}

test("file & dir routes reject an unauthenticated request with 401", async (t) => {
  const { app } = await makeApp(t);
  const list = await app.inject({ method: "GET", url: "/api/files/" });
  assert.equal(list.statusCode, 401);
  assert.equal(list.json().error.code, "unauthorized");

  const mkdir = await app.inject({ method: "POST", url: "/api/dirs/x" });
  assert.equal(mkdir.statusCode, 401);
});

test("full round-trip: mkdir, upload, list, stat, download, delete", async (t) => {
  const { app, userDir, cookie } = await makeAuthedApp(t);
  const inject = client(app, cookie);

  await seedFile(inject, "docs", "hello.txt", "hello world");
  assert.equal(fs.readFileSync(path.join(userDir, "docs/hello.txt"), "utf8"), "hello world");

  await inject({ method: "POST", url: "/api/dirs/docs/sub" });
  const list = await inject({ method: "GET", url: "/api/files/docs" });
  assert.equal(list.statusCode, 200);
  const listing = list.json();
  assert.equal(listing.path, "docs");
  assert.deepEqual(
    listing.entries.map((e: { name: string; type: string }) => `${e.type}:${e.name}`),
    ["directory:sub", "file:hello.txt"],
  );
  assert.equal(listing.entries[1].size, 11);

  const stat = await inject({ method: "GET", url: "/api/files/docs/hello.txt?stat=1" });
  assert.equal(stat.statusCode, 200);
  assert.equal(stat.json().type, "file");
  assert.equal(stat.json().path, "docs/hello.txt");

  const dl = await inject({ method: "GET", url: "/api/files/docs/hello.txt?download=1" });
  assert.equal(dl.statusCode, 200);
  assert.equal(dl.headers["content-type"], "text/plain; charset=utf-8");
  assert.equal(dl.headers["content-length"], "11");
  assert.match(String(dl.headers["content-disposition"]), /^attachment; filename="hello.txt"/);
  assert.equal(dl.body, "hello world");

  const del = await inject({ method: "DELETE", url: "/api/files/docs/hello.txt" });
  assert.equal(del.statusCode, 204);
  const gone = await inject({ method: "GET", url: "/api/files/docs/hello.txt" });
  assert.equal(gone.statusCode, 404);
});

test("GET /api/files lists the caller's own (empty) root", async (t) => {
  const { app, cookie } = await makeAuthedApp(t);
  const res = await client(app, cookie)({ method: "GET", url: "/api/files" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { path: "", entries: [] });
});

test("inline download omits the attachment disposition", async (t) => {
  const { app, cookie } = await makeAuthedApp(t);
  const inject = client(app, cookie);
  await seedFile(inject, "", "note.md", "# hi");
  const res = await inject({ method: "GET", url: "/api/files/note.md" });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers["content-disposition"]), /^inline;/);
  assert.equal(res.headers["content-type"], "text/markdown; charset=utf-8");
});

test("upload to a missing directory is a 404", async (t) => {
  const { app, cookie } = await makeAuthedApp(t);
  const { payload, headers } = multipartBody([{ filename: "x.txt", content: "x" }]);
  const res = await client(app, cookie)({ method: "POST", url: "/api/files/nope", payload, headers });
  assert.equal(res.statusCode, 404);
});

test("upload over the size limit is a 413 and leaves no .part file", async (t) => {
  const { app, userDir, cookie } = await makeAuthedApp(t, { maxFileBytes: 16 });
  const { payload, headers } = multipartBody([
    { filename: "big.bin", content: "x".repeat(1024) },
  ]);
  const res = await client(app, cookie)({ method: "POST", url: "/api/files", payload, headers });
  assert.equal(res.statusCode, 413);
  const leftovers = fs.readdirSync(userDir).filter((n) => n.startsWith(".upload-"));
  assert.deepEqual(leftovers, []);
});

test("overwrite on upload replaces the file", async (t) => {
  const { app, userDir, cookie } = await makeAuthedApp(t);
  const inject = client(app, cookie);
  await seedFile(inject, "", "dup.txt", "first");
  await seedFile(inject, "", "dup.txt", "second");
  assert.equal(fs.readFileSync(path.join(userDir, "dup.txt"), "utf8"), "second");
});

test("delete refuses a non-empty dir without ?recursive", async (t) => {
  const { app, cookie } = await makeAuthedApp(t);
  const inject = client(app, cookie);
  await seedFile(inject, "box", "a.txt", "a");
  const res = await inject({ method: "DELETE", url: "/api/files/box" });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error.code, "conflict");
  const ok = await inject({ method: "DELETE", url: "/api/files/box?recursive=1" });
  assert.equal(ok.statusCode, 204);
});

test("delete removes an empty dir without ?recursive", async (t) => {
  const { app, userDir, cookie } = await makeAuthedApp(t);
  const inject = client(app, cookie);
  await inject({ method: "POST", url: "/api/dirs/empty" });
  const res = await inject({ method: "DELETE", url: "/api/files/empty" });
  assert.equal(res.statusCode, 204);
  assert.equal(fs.existsSync(path.join(userDir, "empty")), false);
});

test("upload temp files are hidden from listings", async (t) => {
  const { app, userDir, cookie } = await makeAuthedApp(t);
  const inject = client(app, cookie);
  await inject({ method: "POST", url: "/api/dirs/d" });
  await seedFile(inject, "d", "real.txt", "hi");
  fs.writeFileSync(path.join(userDir, "d", ".upload-deadbeef-0000.part"), "orphan");
  const res = await inject({ method: "GET", url: "/api/files/d" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.json().entries.map((e: { name: string }) => e.name),
    ["real.txt"],
  );
});

test("missing path is a not_found envelope", async (t) => {
  const { app, cookie } = await makeAuthedApp(t);
  const res = await client(app, cookie)({ method: "GET", url: "/api/files/nope.txt" });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error.code, "not_found");
});

test("delete refuses the storage root", async (t) => {
  const { app, cookie } = await makeAuthedApp(t);
  const res = await client(app, cookie)({ method: "DELETE", url: "/api/files/" });
  assert.equal(res.statusCode, 400);
});

for (const bad of ["..%2f..%2fetc%2fpasswd", "docs%2f..%2f..%2f..%2fetc", "%2fetc%2fpasswd"]) {
  test(`traversal rejected on GET: ${bad}`, async (t) => {
    const { app, cookie } = await makeAuthedApp(t);
    const res = await client(app, cookie)({ method: "GET", url: `/api/files/${bad}` });
    assert.ok(res.statusCode === 400 || res.statusCode === 403, `got ${res.statusCode}`);
  });
}

test("traversal rejected on upload", async (t) => {
  const { app, cookie } = await makeAuthedApp(t);
  const { payload, headers } = multipartBody([{ filename: "x", content: "x" }]);
  const res = await client(app, cookie)({
    method: "POST",
    url: `/api/files/${encodeURIComponent("../..")}`,
    payload,
    headers,
  });
  assert.ok(res.statusCode === 400 || res.statusCode === 403 || res.statusCode === 404);
});
