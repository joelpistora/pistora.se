import type { DatabaseSync } from "node:sqlite";
import type { Role, UserStatus } from "shared";

/**
 * A `users` row as it lives in the database. LOCAL to `apps/api` on purpose — it
 * carries `password_hash`, which must never reach `packages/shared` or the wire.
 * Booleans come back from SQLite as 0/1 and are normalised here.
 */
export interface UserRow {
  id: string;
  email: string;
  role: Role;
  password_hash: string | null;
  google_sub: string | null;
  must_change_password: boolean;
  password_expires_at: number | null;
  status: UserStatus;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

interface RawUserRow extends Omit<UserRow, "must_change_password"> {
  must_change_password: number;
}

function hydrate(row: RawUserRow | undefined): UserRow | undefined {
  if (!row) return undefined;
  return { ...row, must_change_password: row.must_change_password === 1 };
}

export interface CreateUserInput {
  id: string;
  email: string;
  role?: Role;
  passwordHash: string | null;
  mustChangePassword: boolean;
  passwordExpiresAt: number | null;
  now: number;
}

export function createUser(db: DatabaseSync, input: CreateUserInput): UserRow {
  db.prepare(
    `INSERT INTO users
       (id, email, role, password_hash, must_change_password, password_expires_at,
        status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run(
    input.id,
    input.email,
    input.role ?? "user",
    input.passwordHash,
    input.mustChangePassword ? 1 : 0,
    input.passwordExpiresAt,
    input.now,
    input.now,
  );
  return getUserById(db, input.id)!;
}

export function getUserById(db: DatabaseSync, id: string): UserRow | undefined {
  return hydrate(
    db.prepare("SELECT * FROM users WHERE id = ?").get(id) as RawUserRow | undefined,
  );
}

export function getUserByEmail(db: DatabaseSync, email: string): UserRow | undefined {
  return hydrate(
    db.prepare("SELECT * FROM users WHERE email = ?").get(email) as
      | RawUserRow
      | undefined,
  );
}

export function listUsers(db: DatabaseSync): UserRow[] {
  const rows = db
    .prepare("SELECT * FROM users ORDER BY created_at ASC")
    .all() as unknown as RawUserRow[];
  return rows.map((r) => hydrate(r)!);
}

/** Set a real password: clears the must-change flag and any outstanding OTP expiry. */
export function setPassword(
  db: DatabaseSync,
  userId: string,
  passwordHash: string,
  now: number,
): void {
  db.prepare(
    `UPDATE users
       SET password_hash = ?, must_change_password = 0, password_expires_at = NULL,
           updated_at = ?
     WHERE id = ?`,
  ).run(passwordHash, now, userId);
}

/** Replace the password with a fresh one-time password the user must change. */
export function issueOtp(
  db: DatabaseSync,
  userId: string,
  passwordHash: string,
  expiresAt: number,
  now: number,
): void {
  db.prepare(
    `UPDATE users
       SET password_hash = ?, must_change_password = 1, password_expires_at = ?,
           updated_at = ?
     WHERE id = ?`,
  ).run(passwordHash, expiresAt, now, userId);
}

export function setStatus(
  db: DatabaseSync,
  userId: string,
  status: UserStatus,
  now: number,
): void {
  db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(
    status,
    now,
    userId,
  );
}

export function setRole(
  db: DatabaseSync,
  userId: string,
  role: Role,
  now: number,
): void {
  db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(
    role,
    now,
    userId,
  );
}

export function touchLastLogin(db: DatabaseSync, userId: string, now: number): void {
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now, userId);
}

/** Count admins, by default only the ones who can actually still sign in. */
export function countAdmins(
  db: DatabaseSync,
  opts: { activeOnly?: boolean } = {},
): number {
  const activeOnly = opts.activeOnly ?? true;
  const sql = activeOnly
    ? "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'"
    : "SELECT COUNT(*) AS n FROM users WHERE role = 'admin'";
  return (db.prepare(sql).get() as { n: number }).n;
}
