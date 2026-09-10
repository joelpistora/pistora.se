import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "./schema.js";

export type { DatabaseSync };

/**
 * Open (creating if needed) the auth SQLite database and bring its schema up to
 * date. `":memory:"` is honoured for tests — each `openDb(":memory:")` is a
 * private, throwaway database freed when the handle closes.
 *
 * Unlike `STORAGE_ROOT` (which must pre-exist), the DB directory is ours to
 * create, so a missing parent is `mkdir -p`'d rather than treated as an error.
 */
export function openDb(dbPath: string): DatabaseSync {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec(
    "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
  );
  ensureSchema(db);
  return db;
}

/**
 * Apply any migrations the file hasn't seen yet. `user_version` starts at 0 on a
 * fresh database; after applying `MIGRATIONS[i]` it becomes `i + 1`.
 */
export function ensureSchema(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;

  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]!);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    version = i + 1;
  }
}
