import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { FastifyInstance, InjectOptions } from "fastify";
import { loginCookie, makeApp, multipartBody, seedUser } from "../test-helpers.js";

function client(app: FastifyInstance, cookie: string) {
  return (opts: InjectOptions) =>
    app.inject({ ...opts, headers: { cookie, ...opts.headers } });
}

async function upload(
  inject: ReturnType<typeof client>,
  dir: string,
  filename: string,
  content: string,
) {
  if (dir) await inject({ method: "POST", url: `/api/dirs/${dir}` });
  const { payload, headers } = multipartBody([{ filename, content }]);
  const res = await inject({
    method: "POST",
    url: dir ? `/api/files/${dir}` : "/api/files",
    payload,
    headers,
  });
  assert.equal(res.statusCode, 201, res.payload);
}

test("each user only ever sees their own storage; the other's is invisible", async (t) => {
  const { app, root } = await makeApp(t);

  const a = seedUser(app, { email: "alice@pistora.test" });
  const b = seedUser(app, { email: "bob@pistora.test" });
  const injectA = client(app, await loginCookie(app, a.email, a.password));
  const injectB = client(app, await loginCookie(app, b.email, b.password));

  await upload(injectA, "", "secret.txt", "alice's eyes only");
  await upload(injectB, "notes", "b.txt", "bob's note");

  // B's listing has no trace of A
  const bRoot = await injectB({ method: "GET", url: "/api/files/" });
  assert.deepEqual(
    bRoot.json().entries.map((e: { name: string }) => e.name),
    ["notes"],
  );
  assert.equal(
    (await injectB({ method: "GET", url: "/api/files/secret.txt" })).statusCode,
    404,
  );

  // on disk the files sit in each user's own folder
  assert.ok(fs.existsSync(path.join(root, "users", a.id, "secret.txt")));
  assert.ok(fs.existsSync(path.join(root, "users", b.id, "notes/b.txt")));
  assert.ok(!fs.existsSync(path.join(root, "users", b.id, "secret.txt")));
  assert.ok(!fs.existsSync(path.join(root, "secret.txt")));
});

test("path traversal cannot reach another user's directory", async (t) => {
  const { app } = await makeApp(t);
  const a = seedUser(app, { email: "alice@pistora.test" });
  const b = seedUser(app, { email: "bob@pistora.test" });
  const injectA = client(app, await loginCookie(app, a.email, a.password));
  const injectB = client(app, await loginCookie(app, b.email, b.password));

  await upload(injectA, "", "secret.txt", "alice's eyes only");

  for (const attempt of [
    `../${a.id}/secret.txt`,
    `..%2f${a.id}%2fsecret.txt`,
    `../../users/${a.id}/secret.txt`,
  ]) {
    const res = await injectB({
      method: "GET",
      url: `/api/files/${encodeURIComponent(attempt)}`,
    });
    assert.ok(
      res.statusCode === 400 || res.statusCode === 403 || res.statusCode === 404,
      `${attempt} → ${res.statusCode}`,
    );
    assert.notEqual(res.body, "alice's eyes only");
  }
});
