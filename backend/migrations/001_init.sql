-- migrations/001_init.sql
-- Run this once against your Neon Postgres database to set up the schema.
-- You can run it via: psql $DATABASE_URL -f migrations/001_init.sql
-- Or use the Neon SQL editor in their dashboard.

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  board_id      TEXT UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Boards ───────────────────────────────────────────────────────────────────
-- board_id is a UUID string, same value as users.board_id
CREATE TABLE IF NOT EXISTS boards (
  id          TEXT PRIMARY KEY,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'My Whiteboard',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Board canvas snapshots ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_data (
  board_id    TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
  canvas_json JSONB,
  background  TEXT NOT NULL DEFAULT '#ffffff',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup of boards by owner
CREATE INDEX IF NOT EXISTS idx_boards_owner ON boards(owner_id);
