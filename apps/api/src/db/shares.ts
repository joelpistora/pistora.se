import type { DatabaseSync } from "node:sqlite";

/** A `shares` row joined with owner/recipient emails. */
export interface ShareRow {
  id: string;
  owner_id: string;
  owner_email: string;
  path: string;
  recipient_id: string | null;
  recipient_email: string | null;
  token: string | null;
  created_at: number;
  expires_at: number | null;
}

const SELECT = `
  SELECT s.*, o.email AS owner_email, r.email AS recipient_email
    FROM shares s
    JOIN users o ON o.id = s.owner_id
    LEFT JOIN users r ON r.id = s.recipient_id`;

export interface CreateShareInput {
  id: string;
  ownerId: string;
  path: string;
  recipientId: string | null;
  token: string | null;
  now: number;
  expiresAt: number | null;
}

export function createShare(db: DatabaseSync, i: CreateShareInput): ShareRow {
  db.prepare(
    `INSERT INTO shares (id, owner_id, path, recipient_id, token, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(i.id, i.ownerId, i.path, i.recipientId, i.token, i.now, i.expiresAt);
  return getShareById(db, i.id)!;
}

export function getShareById(db: DatabaseSync, id: string): ShareRow | undefined {
  return db.prepare(`${SELECT} WHERE s.id = ?`).get(id) as ShareRow | undefined;
}

export function getShareByToken(db: DatabaseSync, token: string): ShareRow | undefined {
  return db.prepare(`${SELECT} WHERE s.token = ?`).get(token) as ShareRow | undefined;
}

export function listSharesByOwner(db: DatabaseSync, ownerId: string): ShareRow[] {
  return db
    .prepare(`${SELECT} WHERE s.owner_id = ? ORDER BY s.created_at DESC`)
    .all(ownerId) as unknown as ShareRow[];
}

/** Unexpired user shares addressed to `recipientId`. */
export function listSharesForRecipient(
  db: DatabaseSync,
  recipientId: string,
  now: number,
): ShareRow[] {
  return db
    .prepare(
      `${SELECT} WHERE s.recipient_id = ? AND (s.expires_at IS NULL OR s.expires_at > ?)
       ORDER BY s.created_at DESC`,
    )
    .all(recipientId, now) as unknown as ShareRow[];
}

export function deleteShare(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM shares WHERE id = ?").run(id);
}

export function isExpired(row: ShareRow, now: number): boolean {
  return row.expires_at !== null && row.expires_at <= now;
}
