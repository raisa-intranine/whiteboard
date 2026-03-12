-- Board history for collaborative undo/redo
CREATE TABLE IF NOT EXISTS board_history (
  id SERIAL PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  snapshot_json JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  user_id TEXT,
  CONSTRAINT fk_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_board_history_board_time ON board_history(board_id, created_at DESC);

-- Function to cleanup old history (keep only last 100 snapshots per board)
CREATE OR REPLACE FUNCTION cleanup_old_history()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM board_history
  WHERE board_id = NEW.board_id
  AND id NOT IN (
    SELECT id FROM board_history
    WHERE board_id = NEW.board_id
    ORDER BY created_at DESC
    LIMIT 100
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-cleanup after insert
DROP TRIGGER IF EXISTS trigger_cleanup_old_history ON board_history;
CREATE TRIGGER trigger_cleanup_old_history
AFTER INSERT ON board_history
FOR EACH ROW
EXECUTE FUNCTION cleanup_old_history();
