import assert from "node:assert/strict";
import { test } from "node:test";
import { makeApp, seedUser, loginCookie } from "../test-helpers.js";

function cookieHeader(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const header = Array.isArray(raw) ? (raw[0] as string) : (raw as string);
  return header;
}

test("login: success sets an HttpOnly session cookie and returns the user", async (t) => {
  const { app } = await makeApp(t);
  const u = seedUser(app, { email: "u@x.test", password: "s3cret-passw0rd" });

  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "  U@X.test ", password: "s3cret-passw0rd" },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().user, {
    id: u.id,
    email: "u@x.test",
    role: "user",
    mustChangePassword: false,
  });
  const c = cookieHeader(res);
  assert.match(c, /^pistora_session=/);
  assert.match(c, /HttpOnly/i);
  assert.match(c, /SameSite=Lax/i);
});

test("login: wrong password and unknown email both give an identical 401", async (t) => {
  const { app } = await makeApp(t);
  seedUser(app, { email: "u@x.test", password: "s3cret-passw0rd" });

  const wrong = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "u@x.test", password: "nope" },
  });
  const missing = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "ghost@x.test", password: "whatever" },
  });
  assert.equal(wrong.statusCode, 401);
  assert.equal(missing.statusCode, 401);
  assert.deepEqual(wrong.json(), missing.json());
  assert.equal(wrong.json().error.code, "unauthorized");
});

test("login: a disabled account is a 403 account_disabled", async (t) => {
  const { app } = await makeApp(t);
  seedUser(app, { email: "u@x.test", password: "s3cret-passw0rd", status: "disabled" });
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "u@x.test", password: "s3cret-passw0rd" },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error.code, "account_disabled");
});

test("login: an expired one-time password is a 401 otp_expired", async (t) => {
  let clock = 1_000_000;
  const { app } = await makeApp(t, {}, { now: () => clock });
  seedUser(app, {
    email: "invited@x.test",
    password: "ONETIMEPW12",
    mustChange: true,
    passwordExpiresAt: clock + 1000,
  });
  clock += 2000;
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "invited@x.test", password: "ONETIMEPW12" },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, "otp_expired");
});

test("login: repeated failures trip the throttle (429 with Retry-After)", async (t) => {
  const { app } = await makeApp(t);
  seedUser(app, { email: "u@x.test", password: "s3cret-passw0rd" });
  for (let i = 0; i < 5; i++) {
    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "u@x.test", password: "wrong" },
    });
  }
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "u@x.test", password: "s3cret-passw0rd" }, // even the right one is blocked
  });
  assert.equal(res.statusCode, 429);
  assert.equal(res.json().error.code, "too_many_requests");
  assert.ok(Number(res.headers["retry-after"]) > 0);
});

test("me: 401 without a cookie, the user with one", async (t) => {
  const { app } = await makeApp(t);
  const u = seedUser(app, { email: "u@x.test", password: "s3cret-passw0rd" });

  assert.equal((await app.inject({ method: "GET", url: "/api/auth/me" })).statusCode, 401);

  const cookie = await loginCookie(app, "u@x.test", "s3cret-passw0rd");
  const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.id, u.id);
});

test("must-change-password gate: files are blocked, but me + change-password work", async (t) => {
  const { app } = await makeApp(t);
  seedUser(app, {
    email: "invited@x.test",
    password: "TEMP-PW-0001",
    mustChange: true,
  });
  const cookie = await loginCookie(app, "invited@x.test", "TEMP-PW-0001");

  const blocked = await app.inject({
    method: "GET",
    url: "/api/files/",
    headers: { cookie },
  });
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.json().error.code, "password_change_required");

  const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.mustChangePassword, true);

  const changed = await app.inject({
    method: "POST",
    url: "/api/auth/change-password",
    headers: { cookie },
    payload: { currentPassword: "TEMP-PW-0001", newPassword: "a-proper-password" },
  });
  assert.equal(changed.statusCode, 200);
  assert.equal(changed.json().user.mustChangePassword, false);

  // the rotated cookie works and the gate is gone
  const newCookie = cookieHeader(changed).split(";")[0]!;
  const ok = await app.inject({
    method: "GET",
    url: "/api/files/",
    headers: { cookie: newCookie },
  });
  assert.equal(ok.statusCode, 200);

  // the old cookie was invalidated by the rotation
  const stale = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
  assert.equal(stale.statusCode, 401);
});

test("change-password: wrong current → 401, too-short or unchanged → 400 weak_password", async (t) => {
  const { app } = await makeApp(t);
  seedUser(app, { email: "u@x.test", password: "current-password-1" });
  const cookie = await loginCookie(app, "u@x.test", "current-password-1");

  const wrong = await app.inject({
    method: "POST",
    url: "/api/auth/change-password",
    headers: { cookie },
    payload: { currentPassword: "not-it", newPassword: "brand-new-password" },
  });
  assert.equal(wrong.statusCode, 401);

  const short = await app.inject({
    method: "POST",
    url: "/api/auth/change-password",
    headers: { cookie },
    payload: { currentPassword: "current-password-1", newPassword: "short" },
  });
  assert.equal(short.statusCode, 400);
  assert.equal(short.json().error.code, "weak_password");

  const same = await app.inject({
    method: "POST",
    url: "/api/auth/change-password",
    headers: { cookie },
    payload: { currentPassword: "current-password-1", newPassword: "current-password-1" },
  });
  assert.equal(same.statusCode, 400);
});

test("logout: clears the session — the cookie stops working", async (t) => {
  const { app } = await makeApp(t);
  seedUser(app, { email: "u@x.test", password: "s3cret-passw0rd" });
  const cookie = await loginCookie(app, "u@x.test", "s3cret-passw0rd");

  const out = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
  assert.equal(out.statusCode, 204);
  assert.match(cookieHeader(out), /pistora_session=;|pistora_session=""/);

  const after = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
  assert.equal(after.statusCode, 401);
});

test("session expiry: a cookie past its TTL is rejected as session_expired", async (t) => {
  let clock = 1_000_000_000;
  const { app } = await makeApp(t, { sessionTtlHours: 1 }, { now: () => clock });
  seedUser(app, { email: "u@x.test", password: "s3cret-passw0rd" });
  const cookie = await loginCookie(app, "u@x.test", "s3cret-passw0rd");

  clock += 60 * 60 * 1000 + 1; // one hour + 1ms
  const res = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, "session_expired");
});
