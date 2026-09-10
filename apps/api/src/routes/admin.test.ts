import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ensureAdminUser } from "../auth/bootstrap.js";
import {
  loginCookie,
  makeAdminApp,
  makeApp,
  makeAuthedApp,
  seedUser,
} from "../test-helpers.js";

test("bootstrap: a fresh database gets an admin + an invite + a folder", async (t) => {
  const { app, root, mailer } = await makeApp(t);

  const row = app.db
    .prepare("SELECT id, role, status, must_change_password FROM users WHERE email = ?")
    .get("admin@pistora.test") as
    | { id: string; role: string; status: string; must_change_password: number }
    | undefined;
  assert.ok(row, "admin row created");
  assert.equal(row!.role, "admin");
  assert.equal(row!.must_change_password, 1);

  assert.equal(mailer.sent.length, 1);
  assert.equal(mailer.sent[0]!.to, "admin@pistora.test");
  assert.ok(fs.statSync(path.join(root, "users", row!.id)).isDirectory());
});

test("bootstrap is a no-op when an admin already exists", async (t) => {
  const { app, mailer } = await makeApp(t);
  const before = (
    app.db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }
  ).n;
  mailer.sent.length = 0;

  await ensureAdminUser(app);

  assert.equal(
    (app.db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n,
    before,
  );
  assert.equal(mailer.sent.length, 0);
});

test("non-admins get 403 from every /api/admin route", async (t) => {
  const { app, cookie } = await makeAuthedApp(t); // a plain user
  for (const req of [
    { method: "GET" as const, url: "/api/admin/users" },
    { method: "POST" as const, url: "/api/admin/users", payload: { email: "x@y.z" } },
    { method: "PATCH" as const, url: "/api/admin/users/whatever", payload: { role: "user" } },
  ]) {
    const res = await app.inject({ ...req, headers: { cookie } });
    assert.equal(res.statusCode, 403, `${req.method} ${req.url}`);
    assert.equal(res.json().error.code, "forbidden");
  }
});

test("admin invites a user: folder, invite email, and an OTP that forces a change", async (t) => {
  const { app, root, mailer, cookie } = await makeAdminApp(t);

  const created = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: { cookie },
    payload: { email: "  New.User@Example.com " },
  });
  assert.equal(created.statusCode, 201);
  const { user } = created.json();
  assert.equal(user.email, "new.user@example.com");
  assert.equal(user.mustChangePassword, true);
  assert.ok(fs.statSync(path.join(root, "users", user.id)).isDirectory());

  const invite = mailer.sent.at(-1)!;
  assert.equal(invite.to, "new.user@example.com");

  // the invited user can sign in with the OTP and is gated until they change it
  const cookie2 = await loginCookie(app, "new.user@example.com", invite.otp);
  const gated = await app.inject({
    method: "GET",
    url: "/api/files/",
    headers: { cookie: cookie2 },
  });
  assert.equal(gated.statusCode, 403);
  assert.equal(gated.json().error.code, "password_change_required");
});

test("admin invite: exposeInviteOtp echoes the OTP in the response body", async (t) => {
  const { app, cookie } = await makeAdminApp(t, { exposeInviteOtp: true });
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: { cookie },
    payload: { email: "echo@example.com" },
  });
  assert.equal(res.statusCode, 201);
  assert.match(res.json().otp, /^[2-9A-HJKMNP-TV-Z]{10}$/);
});

test("admin invite: duplicate email is a 409, bad email a 400", async (t) => {
  const { app, cookie } = await makeAdminApp(t);
  seedUser(app, { email: "taken@example.com" });

  const dup = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: { cookie },
    payload: { email: "taken@example.com" },
  });
  assert.equal(dup.statusCode, 409);

  const bad = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: { cookie },
    payload: { email: "not-an-email" },
  });
  assert.equal(bad.statusCode, 400);
});

test("PATCH disable: kills the target's live sessions immediately", async (t) => {
  const { app, cookie } = await makeAdminApp(t);
  const victim = seedUser(app, { email: "victim@example.com" });
  const victimCookie = await loginCookie(app, victim.email, victim.password);

  // works before
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/files/", headers: { cookie: victimCookie } }))
      .statusCode,
    200,
  );

  const patched = await app.inject({
    method: "PATCH",
    url: `/api/admin/users/${victim.id}`,
    headers: { cookie },
    payload: { status: "disabled" },
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().user.status, "disabled");

  // the live session was destroyed outright
  const after = await app.inject({
    method: "GET",
    url: "/api/files/",
    headers: { cookie: victimCookie },
  });
  assert.equal(after.statusCode, 401);

  // and a fresh login now tells them why
  const relog = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: victim.email, password: victim.password },
  });
  assert.equal(relog.statusCode, 403);
  assert.equal(relog.json().error.code, "account_disabled");
});

test("PATCH: the last active admin cannot disable or demote themselves", async (t) => {
  const { app, adminId, cookie } = await makeAdminApp(t);

  const selfDisable = await app.inject({
    method: "PATCH",
    url: `/api/admin/users/${adminId}`,
    headers: { cookie },
    payload: { status: "disabled" },
  });
  assert.equal(selfDisable.statusCode, 409);

  const selfDemote = await app.inject({
    method: "PATCH",
    url: `/api/admin/users/${adminId}`,
    headers: { cookie },
    payload: { role: "user" },
  });
  assert.equal(selfDemote.statusCode, 409);
});

test("PATCH: an admin can promote a user and demote another admin", async (t) => {
  const { app, cookie } = await makeAdminApp(t);
  const other = seedUser(app, { email: "other-admin@example.com", role: "admin" });
  const peer = seedUser(app, { email: "peer@example.com", role: "user" });

  const demote = await app.inject({
    method: "PATCH",
    url: `/api/admin/users/${other.id}`,
    headers: { cookie },
    payload: { role: "user" },
  });
  assert.equal(demote.statusCode, 200);
  assert.equal(demote.json().user.role, "user");

  const promote = await app.inject({
    method: "PATCH",
    url: `/api/admin/users/${peer.id}`,
    headers: { cookie },
    payload: { role: "admin" },
  });
  assert.equal(promote.statusCode, 200);
  assert.equal(promote.json().user.role, "admin");
});

test("reset-otp: new OTP works, old sessions are dropped", async (t) => {
  const { app, cookie } = await makeAdminApp(t);
  const u = seedUser(app, { email: "forgot@example.com", password: "old-password-1" });
  const oldCookie = await loginCookie(app, u.email, "old-password-1");

  const res = await app.inject({
    method: "POST",
    url: `/api/admin/users/${u.id}/reset-otp`,
    headers: { cookie },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().user.mustChangePassword, true);

  // old session invalidated
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: oldCookie } }))
      .statusCode,
    401,
  );
  // old password no longer valid
  const oldLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: u.email, password: "old-password-1" },
  });
  assert.equal(oldLogin.statusCode, 401);
});

test("reset-otp / patch on an unknown user id is a 404", async (t) => {
  const { app, cookie } = await makeAdminApp(t);
  for (const req of [
    { method: "PATCH" as const, url: "/api/admin/users/ghost", payload: { role: "user" } },
    { method: "POST" as const, url: "/api/admin/users/ghost/reset-otp" },
  ]) {
    const res = await app.inject({ ...req, headers: { cookie } });
    assert.equal(res.statusCode, 404, `${req.method} ${req.url}`);
  }
});
