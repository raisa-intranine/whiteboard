-- Canvas Sessions: Multiple independent canvases per board
CREATE TABLE IF NOT EXISTS canvas_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Session',
  canvas_json JSONB DEFAULT '{"objects": [], "version": "5.3.0"}'::jsonb,
  background TEXT DEFAULT '#ffffff',
  created_at BIGINT NOT NULL,
  created_by TEXT,
  updated_at BIGINT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  is_private BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_canvas_sessions_board ON canvas_sessions(board_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_canvas_sessions_active ON canvas_sessions(board_id, is_active) WHERE is_active = true;

-- Add session_id to board_history to make history per-session
ALTER TABLE board_history ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES canvas_sessions(id) ON DELETE CASCADE;

-- Update index to include session_id
DROP INDEX IF EXISTS idx_board_history_board_time;
CREATE INDEX idx_board_history_session_time ON board_history(session_id, created_at DESC);

-- Update cleanup function to be session-aware
DROP FUNCTION IF EXISTS cleanup_old_history() CASCADE;
CREATE OR REPLACE FUNCTION cleanup_old_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Keep only last 100 snapshots per session (not per board)
  DELETE FROM board_history
  WHERE session_id = NEW.session_id
  AND id NOT IN (
    SELECT id FROM board_history
    WHERE session_id = NEW.session_id
    ORDER BY created_at DESC
    LIMIT 100
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_cleanup_old_history ON board_history;
CREATE TRIGGER trigger_cleanup_old_history
AFTER INSERT ON board_history
FOR EACH ROW
EXECUTE FUNCTION cleanup_old_history();

-- Migration: Create default session for existing boards
DO $$
DECLARE
  board_record RECORD;
  new_session_id TEXT;
  board_created_at_ms BIGINT;
BEGIN  FOR board_record IN SELECT DISTINCT b.id, bd.canvas_json, bd.background, b.created_at, b.owner_id
                      FROM boards b
                      LEFT JOIN board_data bd ON bd.board_id = b.id
  LOOP
    -- Convert timestamp to milliseconds if needed, or use current time
    BEGIN
      board_created_at_ms := CASE 
        WHEN board_record.created_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM board_record.created_at) * 1000
        ELSE EXTRACT(EPOCH FROM NOW()) * 1000
      END;
    EXCEPTION
      WHEN OTHERS THEN
        board_created_at_ms := EXTRACT(EPOCH FROM NOW()) * 1000;
    END;
    
    -- Create default session for this board
    INSERT INTO canvas_sessions (id, board_id, name, canvas_json, background, created_at, created_by, updated_at, is_active)
    VALUES (
      gen_random_uuid()::text,
      board_record.id,
      'Main Canvas',
      COALESCE(board_record.canvas_json, '{"objects": [], "version": "5.3.0"}'::jsonb),
      COALESCE(board_record.background, '#ffffff'),
      board_created_at_ms,
      board_record.owner_id,
      EXTRACT(EPOCH FROM NOW()) * 1000,
      true
    )
    RETURNING id INTO new_session_id;
    
    -- Link existing history to this session
    UPDATE board_history
    SET session_id = new_session_id
    WHERE board_id = board_record.id
    AND session_id IS NULL;
  END LOOP;
END $$;

-- Make session_id required going forward
ALTER TABLE board_history ALTER COLUMN session_id SET NOT NULL;