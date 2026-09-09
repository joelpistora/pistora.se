import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { makeApp, multipartBody } from "../test-helpers.js";

async function seedFile(app: Awaited<ReturnType<typeof makeApp>>["app"], dir: string, filename: string, content: string) {
  if (dir) await app.inject({ method: "POST", url: `/api/dirs/${dir}` });
  const { payload, headers } = multipartBody([{ filename, content }]);
  const url = dir ? `/api/files/${dir}` : "/api/files";
  const res = await app.inject({ method: "POST", url, payload, headers });
  assert.equal(res.statusCode, 201, res.payload);
  return res;
}

test("full round-trip: mkdir, upload, list, stat, download, delete", async (t) => {
  const { app, root } = await makeApp(t);

  // upload into a nested dir
  await seedFile(app, "docs", "hello.txt", "hello world");
  assert.equal(fs.readFileSync(path.join(root, "docs/hello.txt"), "utf8"), "hello world");

  // list
  await app.inject({ method: "POST", url: "/api/dirs/docs/sub" });
  const list = await app.inject({ method: "GET", url: "/api/files/docs" });
  assert.equal(list.statusCode, 200);
  const listing = list.json();
  assert.equal(listing.path, "docs");
  // directories sort before files
  assert.deepEqual(
    listing.entries.map((e: { name: string; type: string }) => `${e.type}:${e.name}`),
    ["directory:sub", "file:hello.txt"],
  );
  assert.equal(listing.entries[1].size, 11);

  // stat
  const stat = await app.inject({ method: "GET", url: "/api/files/docs/hello.txt?stat=1" });
  assert.equal(stat.statusCode, 200);
  assert.equal(stat.json().type, "file");
  assert.equal(stat.json().path, "docs/hello.txt");

  // download
  const dl = await app.inject({ method: "GET", url: "/api/files/docs/hello.txt?download=1" });
  assert.equal(dl.statusCode, 200);
  assert.equal(dl.headers["content-type"], "text/plain; charset=utf-8");
  assert.equal(dl.headers["content-length"], "11");
  assert.match(String(dl.headers["content-disposition"]), /^attachment; filename="hello.txt"/);
  assert.equal(dl.body, "hello world");

  // delete + gone
  const del = await app.inject({ method: "DELETE", url: "/api/files/docs/hello.txt" });
  assert.equal(del.statusCode, 204);
  const gone = await app.inject({ method: "GET", url: "/api/files/docs/hello.txt" });
  assert.equal(gone.statusCode, 404);
});

test("GET /api/files lists the root", async (t) => {
  const { app } = await makeApp(t);
  const res = await app.inject({ method: "GET", url: "/api/files" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { path: "", entries: [] });
});

test("inline download omits the attachment disposition", async (t) => {
  const { app } = await makeApp(t);
  await seedFile(app, "", "note.md", "# hi");
  const res = await app.inject({ method: "GET", url: "/api/files/note.md" });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers["content-disposition"]), /^inline;/);
  assert.equal(res.headers["content-type"], "text/markdown; charset=utf-8");
});

test("upload to a missing directory is a 404", async (t) => {
  const { app } = await makeApp(t);
  const { payload, headers } = multipartBody([{ filename: "x.txt", content: "x" }]);
  const res = await app.inject({ method: "POST", url: "/api/files/nope", payload, headers });
  assert.equal(res.statusCode, 404);
});

test("upload over the size limit is a 413 and leaves no .part file", async (t) => {
  const { app, root } = await makeApp(t, { maxFileBytes: 16 });
  const { payload, headers } = multipartBody([
    { filename: "big.bin", content: "x".repeat(1024) },
  ]);
  const res = await app.inject({ method: "POST", url: "/api/files", payload, headers });
  assert.equal(res.statusCode, 413);
  const leftovers = fs.readdirSync(root).filter((n) => n.startsWith(".upload-"));
  assert.deepEqual(leftovers, []);
});

test("overwrite on upload replaces the file", async (t) => {
  const { app, root } = await makeApp(t);
  await seedFile(app, "", "dup.txt", "first");
  await seedFile(app, "", "dup.txt", "second");
  assert.equal(fs.readFileSync(path.join(root, "dup.txt"), "utf8"), "second");
});

test("delete refuses a non-empty dir without ?recursive", async (t) => {
  const { app } = await makeApp(t);
  await seedFile(app, "box", "a.txt", "a");
  const res = await app.inject({ method: "DELETE", url: "/api/files/box" });
  assert.equal(res.statusCode, 409);
  const ok = await app.inject({ method: "DELETE", url: "/api/files/box?recursive=1" });
  assert.equal(ok.statusCode, 204);
});

test("delete refuses the storage root", async (t) => {
  const { app } = await makeApp(t);
  const res = await app.inject({ method: "DELETE", url: "/api/files/" });
  assert.equal(res.statusCode, 400);
});

for (const bad of ["..%2f..%2fetc%2fpasswd", "docs%2f..%2f..%2f..%2fetc", "%2fetc%2fpasswd"]) {
  test(`traversal rejected on GET: ${bad}`, async (t) => {
    const { app } = await makeApp(t);
    const res = await app.inject({ method: "GET", url: `/api/files/${bad}` });
    assert.ok(res.statusCode === 400 || res.statusCode === 403, `got ${res.statusCode}`);
  });
}

test("traversal rejected on upload", async (t) => {
  const { app } = await makeApp(t);
  const { payload, headers } = multipartBody([{ filename: "x", content: "x" }]);
  const res = await app.inject({
    method: "POST",
    url: `/api/files/${encodeURIComponent("../..")}`,
    payload,
    headers,
  });
  assert.ok(res.statusCode === 400 || res.statusCode === 403 || res.statusCode === 404);
});
