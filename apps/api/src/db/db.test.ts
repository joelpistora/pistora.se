import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "./index.js";
import {
  countAdmins,
  createUser,
  getUserByEmail,
  getUserById,
  issueOtp,
  listUsers,
  setPassword,
  setRole,
  setStatus,
  touchLastLogin,
} from "./users.js";
import {
  createSession,
  deleteExpiredSessions,
  deleteSession,
  deleteSessionsForUser,
  getSession,
  touchSession,
} from "./sessions.js";

function freshDb() {
  return openDb(":memory:");
}

test("openDb creates the v1 schema and sets user_version", () => {
  const db = freshDb();
  const { user_version } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  assert.equal(user_version, 1);
  // idempotent — a second openDb-style ensureSchema is a no-op
  db.close();
});

test("users: create / lookup / list, booleans hydrated", () => {
  const db = freshDb();
  const u = createUser(db, {
    id: "u1",
    email: "a@b.c",
    passwordHash: "scrypt$1$1$1$aa$bb",
    mustChangePassword: true,
    passwordExpiresAt: 123,
    now: 1000,
  });
  assert.equal(u.must_change_password, true);
  assert.equal(u.role, "user");
  assert.equal(u.status, "active");
  assert.deepEqual(getUserById(db, "u1"), u);
  assert.deepEqual(getUserByEmail(db, "a@b.c"), u);
  assert.equal(getUserByEmail(db, "nope@b.c"), undefined);
  assert.equal(listUsers(db).length, 1);
  db.close();
});

test("users: duplicate email is rejected by the UNIQUE constraint", () => {
  const db = freshDb();
  createUser(db, {
    id: "u1", email: "a@b.c", passwordHash: null,
    mustChangePassword: false, passwordExpiresAt: null, now: 1,
  });
  assert.throws(() =>
    createUser(db, {
      id: "u2", email: "a@b.c", passwordHash: null,
      mustChangePassword: false, passwordExpiresAt: null, now: 2,
    }),
  );
  db.close();
});

test("users: setPassword clears must-change + expiry; issueOtp sets them", () => {
  const db = freshDb();
  createUser(db, {
    id: "u1", email: "a@b.c", passwordHash: "old",
    mustChangePassword: true, passwordExpiresAt: 500, now: 1,
  });
  setPassword(db, "u1", "new", 10);
  let u = getUserById(db, "u1")!;
  assert.equal(u.password_hash, "new");
  assert.equal(u.must_change_password, false);
  assert.equal(u.password_expires_at, null);

  issueOtp(db, "u1", "otp", 999, 20);
  u = getUserById(db, "u1")!;
  assert.equal(u.must_change_password, true);
  assert.equal(u.password_expires_at, 999);
  db.close();
});

test("users: role / status / lastLogin updates and countAdmins", () => {
  const db = freshDb();
  createUser(db, {
    id: "a", email: "admin@x", role: "admin", passwordHash: null,
    mustChangePassword: false, passwordExpiresAt: null, now: 1,
  });
  createUser(db, {
    id: "u", email: "user@x", passwordHash: null,
    mustChangePassword: false, passwordExpiresAt: null, now: 2,
  });
  assert.equal(countAdmins(db), 1);
  setRole(db, "u", "admin", 3);
  assert.equal(countAdmins(db), 2);
  setStatus(db, "u", "disabled", 4);
  assert.equal(countAdmins(db), 1); // activeOnly by default
  assert.equal(countAdmins(db, { activeOnly: false }), 2);
  touchLastLogin(db, "a", 42);
  assert.equal(getUserById(db, "a")!.last_login_at, 42);
  db.close();
});

test("sessions: create / get / touch throttle / delete / cascade / expiry sweep", () => {
  const db = freshDb();
  createUser(db, {
    id: "u1", email: "a@b.c", passwordHash: null,
    mustChangePassword: false, passwordExpiresAt: null, now: 1,
  });

  createSession(db, {
    tokenHash: "h1", userId: "u1", now: 1000, expiresAt: 5000, userAgent: "UA", ip: "1.2.3.4",
  });
  assert.equal(getSession(db, "h1")!.user_id, "u1");

  // touch is throttled: within 60s of the last write it's a no-op
  touchSession(db, "h1", 1000 + 30_000);
  assert.equal(getSession(db, "h1")!.last_seen_at, 1000);
  touchSession(db, "h1", 1000 + 61_000);
  assert.equal(getSession(db, "h1")!.last_seen_at, 1000 + 61_000);

  deleteSession(db, "h1");
  assert.equal(getSession(db, "h1"), undefined);

  createSession(db, { tokenHash: "h2", userId: "u1", now: 1, expiresAt: 100 });
  createSession(db, { tokenHash: "h3", userId: "u1", now: 1, expiresAt: 9_999_999 });
  deleteExpiredSessions(db, 500);
  assert.equal(getSession(db, "h2"), undefined);
  assert.equal(getSession(db, "h3")!.token_hash, "h3");

  deleteSessionsForUser(db, "u1");
  assert.equal(getSession(db, "h3"), undefined);

  // FK cascade: deleting the user removes their sessions
  createSession(db, { tokenHash: "h4", userId: "u1", now: 1, expiresAt: 9_999_999 });
  db.prepare("DELETE FROM users WHERE id = ?").run("u1");
  assert.equal(getSession(db, "h4"), undefined);
  db.close();
});
