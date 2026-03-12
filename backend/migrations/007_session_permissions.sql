-- migrations/007_session_permissions.sql
-- Adds session-level permissions so each canvas can be shared independently

-- Per-user session permissions (for session-specific sharing)
CREATE TABLE IF NOT EXISTS session_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES canvas_sessions(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'editor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_perms_session ON session_permissions(session_id);
CREATE INDEX IF NOT EXISTS idx_session_perms_user ON session_permissions(user_id);

-- Add comment for clarity
COMMENT ON TABLE session_permissions IS 'Per-session collaborator permissions. Each canvas session can be shared with different users.';
COMMENT ON COLUMN canvas_sessions.is_private IS 'When true, only users with explicit session_permissions can access this session. When false, anyone with board access can view this session.';