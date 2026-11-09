import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { FastifyInstance } from "fastify";
import type { Share } from "shared";
import { loginCookie, makeApp, multipartBody, seedUser } from "../test-helpers.js";

async function setup(t: TestContext) {
  const clock = { now: 1_000_000 };
  const { app } = await makeApp(t, {}, { now: () => clock.now });
  const a = seedUser(app, { email: "alice@pistora.test" });
  const b = seedUser(app, { email: "bob@pistora.test" });
  const c = seedUser(app, { email: "carol@pistora.test" });
  const ca = await loginCookie(app, a.email, a.password);
  const cb = await loginCookie(app, b.email, b.password);
  const cc = await loginCookie(app, c.email, c.password);
  // alice: docs/a.txt, docs/sub/b.txt, private/p.txt
  await put(app, ca, "docs", "a.txt", "AAA");
  await put(app, ca, "docs/sub", "b.txt", "BBB");
  await put(app, ca, "private", "p.txt", "PPP");
  return { app, clock, ca, cb, cc };
}

async function put(app: FastifyInstance, cookie: string, dir: string, filename: string, content: string) {
  await app.inject({ method: "POST", url: `/api/dirs/${dir}`, headers: { cookie } });
  const { payload, headers } = multipartBody([{ filename, content }]);
  const res = await app.inject({
    method: "POST",
    url: `/api/files/${dir}`,
    payload,
    headers: { cookie, ...headers },
  });
  assert.equal(res.statusCode, 201, res.payload);
}

const share = (app: FastifyInstance, cookie: string, payload: object) =>
  app.inject({ method: "POST", url: "/api/shares", headers: { cookie }, payload });

test("user share: recipient can list and download, not write; others get 404", async (t) => {
  const { app, ca, cb, cc } = await setup(t);
  const res = await share(app, ca, { path: "docs", with: "Bob@pistora.test" });
  assert.equal(res.statusCode, 201, res.payload);
  const s = res.json() as Share;
  assert.equal(s.type, "directory");
  assert.equal(s.recipientEmail, "bob@pistora.test");

  const list = await app.inject({ method: "GET", url: `/api/shares/${s.id}/files`, headers: { cookie: cb } });
  assert.equal(list.statusCode, 200);
  assert.deepEqual(
    (list.json().entries as { name: string }[]).map((e) => e.name),
    ["sub", "a.txt"],
  );
  const dl = await app.inject({ method: "GET", url: `/api/shares/${s.id}/files/sub/b.txt`, headers: { cookie: cb } });
  assert.equal(dl.payload, "BBB");

  // Not addressed to carol; also not a path outside the share.
  const other = await app.inject({ method: "GET", url: `/api/shares/${s.id}/files`, headers: { cookie: cc } });
  assert.equal(other.statusCode, 404);
  const esc = await app.inject({ method: "GET", url: `/api/shares/${s.id}/files/..%2Fprivate%2Fp.txt`, headers: { cookie: cb } });
  assert.equal(esc.statusCode, 400);

  // Read-only: no write route exists under shares.
  const w = await app.inject({ method: "DELETE", url: `/api/shares/${s.id}/files/a.txt`, headers: { cookie: cb } });
  assert.notEqual(w.statusCode, 204);

  const mine = await app.inject({ method: "GET", url: "/api/shares?direction=with-me", headers: { cookie: cb } });
  const shares = mine.json().shares as Share[];
  assert.equal(shares.length, 1);
  assert.equal(shares[0]!.token, null);
});

test("single-file share serves the file and nothing beside it", async (t) => {
  const { app, ca, cb } = await setup(t);
  const s = (await share(app, ca, { path: "docs/a.txt", with: "bob@pistora.test" })).json() as Share;
  const ok = await app.inject({ method: "GET", url: `/api/shares/${s.id}/files`, headers: { cookie: cb } });
  assert.equal(ok.payload, "AAA");
  const no = await app.inject({ method: "GET", url: `/api/shares/${s.id}/files/x`, headers: { cookie: cb } });
  assert.equal(no.statusCode, 404);
});

test("link share: public access by token, revoke and expiry", async (t) => {
  const { app, clock, ca } = await setup(t);
  const s = (await share(app, ca, { path: "docs", link: true, expiresAt: clock.now + 60_000 })).json() as Share;
  assert.ok(s.token && s.token.length >= 40);

  const info = await app.inject({ method: "GET", url: `/api/public/${s.token}` });
  assert.deepEqual(info.json(), { name: "docs", type: "directory", expiresAt: clock.now + 60_000 });
  const f = await app.inject({ method: "GET", url: `/api/public/${s.token}/files/a.txt` });
  assert.equal(f.payload, "AAA");
  const esc = await app.inject({ method: "GET", url: `/api/public/${s.token}/files/..%2Fprivate%2Fp.txt` });
  assert.equal(esc.statusCode, 400);
  assert.equal((await app.inject({ method: "GET", url: "/api/public/nope" })).statusCode, 404);

  clock.now += 61_000;
  assert.equal((await app.inject({ method: "GET", url: `/api/public/${s.token}` })).statusCode, 404);
});

test("owner lists and revokes; others cannot revoke", async (t) => {
  const { app, ca, cb } = await setup(t);
  const s = (await share(app, ca, { path: "docs", link: true })).json() as Share;
  const list = await app.inject({ method: "GET", url: "/api/shares", headers: { cookie: ca } });
  assert.equal((list.json().shares as Share[])[0]!.token, s.token);

  const bad = await app.inject({ method: "DELETE", url: `/api/shares/${s.id}`, headers: { cookie: cb } });
  assert.equal(bad.statusCode, 404);
  const del = await app.inject({ method: "DELETE", url: `/api/shares/${s.id}`, headers: { cookie: ca } });
  assert.equal(del.statusCode, 204);
  assert.equal((await app.inject({ method: "GET", url: `/api/public/${s.token}` })).statusCode, 404);
});

test("validation: need exactly one target, existing path, real distinct user", async (t) => {
  const { app, ca } = await setup(t);
  assert.equal((await share(app, ca, { path: "docs" })).statusCode, 400);
  assert.equal((await share(app, ca, { path: "docs", link: true, with: "bob@pistora.test" })).statusCode, 400);
  assert.equal((await share(app, ca, { path: "missing", link: true })).statusCode, 404);
  assert.equal((await share(app, ca, { path: "docs", with: "nobody@pistora.test" })).statusCode, 404);
  assert.equal((await share(app, ca, { path: "docs", with: "alice@pistora.test" })).statusCode, 400);
  assert.equal((await share(app, ca, { path: "", link: true })).statusCode, 400);
  assert.equal((await share(app, ca, { path: "docs", link: true, expiresAt: 5 })).statusCode, 400);
  const anon = await app.inject({ method: "POST", url: "/api/shares", payload: { path: "docs", link: true } });
  assert.equal(anon.statusCode, 401);
});

test("expired user share disappears for the recipient", async (t) => {
  const { app, clock, ca, cb } = await setup(t);
  const s = (await share(app, ca, { path: "docs", with: "bob@pistora.test", expiresAt: clock.now + 1000 })).json() as Share;
  clock.now += 2000;
  const r = await app.inject({ method: "GET", url: `/api/shares/${s.id}/files`, headers: { cookie: cb } });
  assert.equal(r.statusCode, 404);
  const l = await app.inject({ method: "GET", url: "/api/shares?direction=with-me", headers: { cookie: cb } });
  assert.equal((l.json().shares as Share[]).length, 0);
});
