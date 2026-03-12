-- migrations/004_add_is_public.sql
-- Adds is_public flag to boards for shareable public links,
-- and a board_permissions table for email-invite sharing.

-- Public flag on boards so any user with the link can view/edit
ALTER TABLE boards ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- Per-user collaborator permissions (for email-invite sharing)
CREATE TABLE IF NOT EXISTS board_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'editor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_board_perms_board ON board_permissions(board_id);
CREATE INDEX IF NOT EXISTS idx_board_perms_user  ON board_permissions(user_id);
