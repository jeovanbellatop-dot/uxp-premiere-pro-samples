// SQLite database (better-sqlite3). Zero external services: the file is created
// on first run under data/studio.db. One place owns the schema + migrations.

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// DATA_DIR can point at a mounted persistent disk in production (set it in the
// host env); defaults to ./data for local dev.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

declare global {
  // Reuse the connection across hot-reloads in dev.
  // eslint-disable-next-line no-var
  var __studioDb: Database.Database | undefined;
}

export const db: Database.Database =
  global.__studioDb ?? new Database(path.join(DATA_DIR, "studio.db"));
global.__studioDb = db;

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  password_hash TEXT NOT NULL,
  credits       INTEGER NOT NULL DEFAULT 100,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  tool       TEXT NOT NULL,
  kind       TEXT NOT NULL,
  prompt     TEXT NOT NULL,
  output     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool        TEXT NOT NULL,
  status      TEXT NOT NULL,            -- queued | running | done | failed
  cost        INTEGER NOT NULL,
  error       TEXT,
  asset_id    TEXT REFERENCES assets(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS credit_txns (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL,            -- purchase | job | signup | refund
  ref        TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_user   ON jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);
