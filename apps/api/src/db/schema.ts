/**
 * Schema definitions for the auth datastore (the project's first database).
 *
 * Versioning is tracked with SQLite's `PRAGMA user_version` — a single integer
 * baked into the file header, no bookkeeping table. `ensureSchema()` in
 * `db/index.ts` applies each step in order and bumps the pragma.
 *
 * v1 tables:
 *   - `users`    — one row per invited account. `password_hash` is nullable so a
 *                  future "Sign in with Google" user (matched on `google_sub`)
 *                  can exist without a password. Timestamps are epoch-ms
 *                  integers; booleans are 0/1 integers (mapped in the DAO).
 *   - `sessions` — one row per active login. The primary key is the SHA-256 of
 *                  the opaque cookie token; the raw token is never stored.
 *
 * v2: `users.quota_bytes` — per-user upload ceiling. Default 1 GiB; admins
 *     ignore it (they operate on the whole storage root).
 */

/** Default per-user quota (1 GiB). Also the fallback in `AppConfig.defaultQuotaBytes`. */
export const DEFAULT_QUOTA_BYTES = 1024 * 1024 * 1024;

export const SCHEMA_V1 = /* sql */ `
CREATE TABLE users (
  id                   TEXT    PRIMARY KEY,
  email                TEXT    NOT NULL UNIQUE,
  role                 TEXT    NOT NULL DEFAULT 'user',
  password_hash        TEXT,
  google_sub           TEXT    UNIQUE,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  password_expires_at  INTEGER,
  status               TEXT    NOT NULL DEFAULT 'active',
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  last_login_at        INTEGER
);

CREATE TABLE sessions (
  token_hash   TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  user_agent   TEXT,
  ip           TEXT
);

CREATE INDEX idx_sessions_user    ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
`;

export const SCHEMA_V2 = /* sql */ `
ALTER TABLE users ADD COLUMN quota_bytes INTEGER NOT NULL DEFAULT ${DEFAULT_QUOTA_BYTES};
`;

/** Ordered migrations. Index + 1 is the `user_version` each one produces. */
export const MIGRATIONS: readonly string[] = [SCHEMA_V1, SCHEMA_V2];
