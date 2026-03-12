const pool = require('../../lib/db')
const { requireAuth } = require('../../lib/middleware')

// GET /api/boards/:boardId/history - Fetch history for a session
const getHistory = async (req, res) => {
  const { boardId } = req.params
  const sessionId = req.query.sessionId

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' })
  }
  
  try {
    const limit = parseInt(req.query.limit) || 100
    
    const result = await pool.query(
      `SELECT id, snapshot_json, created_at, user_id 
       FROM board_history 
       WHERE session_id = $1 
       ORDER BY created_at ASC
       LIMIT $2`,
      [sessionId, limit]
    )
    
    return res.json({ 
      history: result.rows.map(row => ({
        id: row.id,
        snapshot: row.snapshot_json,
        createdAt: row.created_at,
        userId: row.user_id
      }))
    })
  } catch (err) {
    console.error('[History API] Error fetching history:', err)
    return res.status(500).json({ error: 'Failed to fetch history' })
  }
}

// POST /api/boards/:boardId/history - Save a snapshot
const saveHistory = async (req, res) => {
  const { boardId } = req.params
  const sessionId = req.body.sessionId

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' })
  }
  
  let payload
  try {
    payload = requireAuth(req)
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message })
  }
  
  try {
    const { snapshot, createdAt } = req.body
    const userId = payload.userId
    
    if (!snapshot || typeof snapshot !== 'object') {
      return res.status(400).json({ error: 'Invalid snapshot data' })
    }
    
    const timestamp = createdAt || Date.now()
    
    const result = await pool.query(
      `INSERT INTO board_history (board_id, session_id, snapshot_json, created_at, user_id) 
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [boardId, sessionId, snapshot, timestamp, userId]
    )
    
    // Also update the session's current canvas state
    await pool.query(
      `UPDATE canvas_sessions 
       SET canvas_json = $1, updated_at = $2 
       WHERE id = $3`,
      [snapshot, timestamp, sessionId]
    )
    
    return res.json({ 
      success: true, 
      id: result.rows[0].id,
      createdAt: timestamp
    })
  } catch (err) {
    console.error('[History API] Error saving snapshot:', err)
    return res.status(500).json({ error: 'Failed to save snapshot' })
  }
}

// DELETE /api/boards/:boardId/history - Clear history for a session
const clearHistory = async (req, res) => {
  const sessionId = req.query.sessionId

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' })
  }
  
  let payload
  try {
    payload = requireAuth(req)
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message })
  }
  
  try {
    await pool.query('DELETE FROM board_history WHERE session_id = $1', [sessionId])
    return res.json({ success: true })
  } catch (err) {
    console.error('[History API] Error clearing history:', err)
    return res.status(500).json({ error: 'Failed to clear history' })
  }
}

module.exports = { getHistory, saveHistory, clearHistory }
