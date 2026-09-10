import type { DatabaseSync } from "node:sqlite";

export interface SessionRow {
  token_hash: string;
  user_id: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  user_agent: string | null;
  ip: string | null;
}

export interface CreateSessionInput {
  tokenHash: string;
  userId: string;
  now: number;
  expiresAt: number;
  userAgent?: string | null;
  ip?: string | null;
}

export function createSession(db: DatabaseSync, input: CreateSessionInput): void {
  db.prepare(
    `INSERT INTO sessions
       (token_hash, user_id, created_at, last_seen_at, expires_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.tokenHash,
    input.userId,
    input.now,
    input.now,
    input.expiresAt,
    input.userAgent ?? null,
    input.ip ?? null,
  );
}

export function getSession(
  db: DatabaseSync,
  tokenHash: string,
): SessionRow | undefined {
  return db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(tokenHash) as
    | SessionRow
    | undefined;
}

/** Bump `last_seen_at`, but only once a minute — keeps a busy session from writing on every request. */
export function touchSession(
  db: DatabaseSync,
  tokenHash: string,
  now: number,
): void {
  db.prepare(
    "UPDATE sessions SET last_seen_at = ? WHERE token_hash = ? AND last_seen_at < ?",
  ).run(now, tokenHash, now - 60_000);
}

export function deleteSession(db: DatabaseSync, tokenHash: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function deleteSessionsForUser(db: DatabaseSync, userId: string): void {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function deleteExpiredSessions(db: DatabaseSync, now: number): void {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
}
