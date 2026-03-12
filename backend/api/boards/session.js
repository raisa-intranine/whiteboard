const pool = require('../../lib/db')
const { requireAuth } = require('../../lib/middleware')

// GET /api/boards/:boardId/sessions - List all sessions for a board
const listSessions = async (req, res) => {
  let payload
  try {
    payload = requireAuth(req)
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message })
  }
  
  const { boardId } = req.params
  const userId = payload.userId
  
  try {
    // Check if user is board owner
    const ownerCheck = await pool.query(
      'SELECT owner_id FROM boards WHERE id = $1',
      [boardId]
    )
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Board not found' })
    }
    
    const isOwner = ownerCheck.rows[0].owner_id === userId
    
    // If user is owner, return all sessions
    if (isOwner) {
      const result = await pool.query(
        `SELECT id, name, background, created_at, created_by, updated_at, is_active, is_private
         FROM canvas_sessions 
         WHERE board_id = $1 
         ORDER BY created_at DESC`,
        [boardId]
      )
      return res.json({ sessions: result.rows })
    }
    
    // For non-owners, filter based on permissions:
    // - Include all non-private sessions
    // - Include private sessions where user has explicit permission
    const result = await pool.query(
      `SELECT DISTINCT cs.id, cs.name, cs.background, cs.created_at, cs.created_by, 
              cs.updated_at, cs.is_active, cs.is_private
       FROM canvas_sessions cs
       LEFT JOIN session_permissions sp ON cs.id = sp.session_id AND sp.user_id = $2
       WHERE cs.board_id = $1 
         AND (cs.is_private = false OR sp.user_id IS NOT NULL)
       ORDER BY cs.created_at DESC`,
      [boardId, userId]
    )
    
    return res.json({ sessions: result.rows })
  } catch (err) {
    console.error('[Sessions API] Error listing sessions:', err)
    return res.status(500).json({ error: 'Failed to list sessions' })
  }
}

// POST /api/boards/:boardId/sessions - Create new session
const createSession = async (req, res) => {
  let payload
  try {
    payload = requireAuth(req)
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message })
  }
  
  const { boardId } = req.params
  const { name, isPrivate } = req.body
  
  try {
    const result = await pool.query(
      `INSERT INTO canvas_sessions (board_id, name, created_at, created_by, updated_at, is_private)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, background, created_at, created_by, updated_at, is_active, is_private`,
      [
        boardId,
        name || 'New Canvas Session',
        Date.now(),
        payload.userId,
        Date.now(),
        isPrivate || false
      ]
    )
    
    // Create initial blank snapshot for this session
    const sessionId = result.rows[0].id
    const blankSnapshot = { objects: [], version: '5.3.0' }
    
    await pool.query(
      `INSERT INTO board_history (board_id, session_id, snapshot_json, created_at, user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [boardId, sessionId, blankSnapshot, Date.now(), payload.userId]
    )
    
    return res.json({ session: result.rows[0] })
  } catch (err) {
    console.error('[Sessions API] Error creating session:', err)
    return res.status(500).json({ error: 'Failed to create session' })
  }
}

// GET /api/boards/:boardId/sessions/:sessionId - Get session details and canvas
const getSession = async (req, res) => {
  const { sessionId } = req.params
  
  try {
    const result = await pool.query(
      `SELECT id, board_id, name, canvas_json, background, created_at, created_by, updated_at, is_active, is_private
       FROM canvas_sessions 
       WHERE id = $1`,
      [sessionId]
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    return res.json({ session: result.rows[0] })
  } catch (err) {
    console.error('[Sessions API] Error getting session:', err)
    return res.status(500).json({ error: 'Failed to get session' })
  }
}

// PUT /api/boards/:boardId/sessions/:sessionId - Update session (save canvas)
const updateSession = async (req, res) => {
  let payload
  try {
    payload = requireAuth(req)
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message })
  }
  
  const { sessionId } = req.params
  const { name, canvasJson, background } = req.body
  
  try {
    const updates = []
    const values = []
    let paramIndex = 1
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      values.push(name)
    }
    if (canvasJson !== undefined) {
      updates.push(`canvas_json = $${paramIndex++}`)
      values.push(canvasJson)
    }
    if (background !== undefined) {
      updates.push(`background = $${paramIndex++}`)
      values.push(background)
    }
    
    updates.push(`updated_at = $${paramIndex++}`)
    values.push(Date.now())
    
    values.push(sessionId)
    
    const result = await pool.query(
      `UPDATE canvas_sessions 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, name, background, created_at, created_by, updated_at, is_active, is_private`,
      values
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    return res.json({ session: result.rows[0] })
  } catch (err) {
    console.error('[Sessions API] Error updating session:', err)
    return res.status(500).json({ error: 'Failed to update session' })
  }
}

// PUT /api/boards/:boardId/sessions/:sessionId/activate - Make session active
const activateSession = async (req, res) => {
  let payload
  try {
    payload = requireAuth(req)
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message })
  }
  
  const { boardId, sessionId } = req.params
  
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    
    // Deactivate all sessions for this board
    await client.query(
      'UPDATE canvas_sessions SET is_active = false WHERE board_id = $1',
      [boardId]
    )
    
    // Activate the selected session
    const result = await client.query(
      `UPDATE canvas_sessions 
       SET is_active = true, updated_at = $1
       WHERE id = $2
       RETURNING id, name, background, created_at, created_by, updated_at, is_active, is_private`,
      [Date.now(), sessionId]
    )
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Session not found' })
    }
    
    await client.query('COMMIT')
    return res.json({ session: result.rows[0] })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[Sessions API] Error activating session:', err)
    return res.status(500).json({ error: 'Failed to activate session' })
  } finally {
    client.release()
  }
}

// DELETE /api/boards/:boardId/sessions/:sessionId - Delete session
const deleteSession = async (req, res) => {
  let payload
  try {
    payload = requireAuth(req)
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message })
  }
  
  const { sessionId } = req.params
  
  try {
    // Check if this is the last session
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM canvas_sessions WHERE board_id = (SELECT board_id FROM canvas_sessions WHERE id = $1)',
      [sessionId]
    )
    
    if (parseInt(countResult.rows[0].count) <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last session. Board must have at least one session.' })
    }
    
    const result = await pool.query(
      'DELETE FROM canvas_sessions WHERE id = $1 RETURNING id',
      [sessionId]
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    return res.json({ success: true })
  } catch (err) {
    console.error('[Sessions API] Error deleting session:', err)
    return res.status(500).json({ error: 'Failed to delete session' })
  }
}

module.exports = { 
  listSessions, 
  createSession, 
  getSession, 
  updateSession, 
  activateSession, 
  deleteSession 
}