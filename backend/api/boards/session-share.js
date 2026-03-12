// api/boards/session-share.js — POST /api/boards/:boardId/sessions/:sessionId/share
// Share a specific canvas session with a user by email
// Requires: Authorization: Bearer <jwt>

const pool = require('../../lib/db')
const { requireAuth } = require('../../lib/middleware')
const { sendSessionInvitation } = require('../../lib/email')

// POST /api/boards/:boardId/sessions/:sessionId/share - Share session with user
const shareSession = async (req, res) => {
  let payload
  try {
    payload = requireAuth(req)
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message })
  }
  
  const { boardId, sessionId } = req.params
  const { email, role = 'editor' } = req.body
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }
  
  try {
    // Verify the session belongs to this board
    const sessionCheck = await pool.query(
      'SELECT id, name, board_id FROM canvas_sessions WHERE id = $1 AND board_id = $2',
      [sessionId, boardId]
    )
    
    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    // Verify the requester has access to this board (owner or board collaborator)
    const accessCheck = await pool.query(
      `SELECT 1 FROM boards WHERE id = $1 AND owner_id = $2
       UNION
       SELECT 1 FROM board_permissions WHERE board_id = $1 AND user_id = $2`,
      [boardId, payload.userId]
    )
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You do not have access to this board' })
    }
    
    // Find user by email
    const userResult = await pool.query(
      'SELECT id, name, email FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    )
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: `No user found with email ${email}` })
    }
    
    const collaborator = userResult.rows[0]
    
    // Don't share with yourself
    if (collaborator.id === payload.userId) {
      return res.status(400).json({ error: 'Cannot share with yourself' })
    }
    
    // Add session permission
    await pool.query(
      `INSERT INTO session_permissions (session_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id, user_id) 
       DO UPDATE SET role = EXCLUDED.role`,
      [sessionId, collaborator.id, role]
    )
    
    // Get inviter info for email
    const inviterInfo = await pool.query(
      'SELECT name, email FROM users WHERE id = $1',
      [payload.userId]
    )
    const inviter = inviterInfo.rows[0]
    
    // Get session info
    const sessionInfo = sessionCheck.rows[0]
    
    // Send email invitation (gracefully handle failures)
    let emailSent = false
    try {
      const sessionUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}?board=${boardId}&session=${sessionId}`
      await sendSessionInvitation({
        to: collaborator.email,
        boardId,
        sessionId,
        sessionName: sessionInfo.name,
        sessionUrl,
        inviterName: inviter.name,
        inviterEmail: inviter.email,
      })
      emailSent = true
      console.log('[Session Share] Email invitation sent to', collaborator.email)
    } catch (emailErr) {
      console.warn('[Session Share] Failed to send email invitation:', emailErr.message)
      console.warn('[Session Share] Collaborator was added successfully, but email notification failed')
      // Don't fail the request - collaborator was added successfully
    }
    
    return res.json({
      success: true,
      emailSent,
      collaborator: {
        id: collaborator.id,
        name: collaborator.name,
        email: collaborator.email,
        role
      }
    })
  } catch (err) {
    console.error('[Session Share API] Error sharing session:', err)
    return res.status(500).json({ error: 'Failed to share session' })
  }
}

// GET /api/boards/:boardId/sessions/:sessionId/collaborators - List session collaborators
const getSessionCollaborators = async (req, res) => {
  let payload
  try {
    payload = requireAuth(req)
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message })
  }
  
  const { sessionId } = req.params
  
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, sp.role
       FROM session_permissions sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.session_id = $1
       ORDER BY sp.created_at ASC`,
      [sessionId]
    )
    
    return res.json({ collaborators: result.rows })
  } catch (err) {
    console.error('[Session Share API] Error fetching collaborators:', err)
    return res.status(500).json({ error: 'Failed to fetch collaborators' })
  }
}

// DELETE /api/boards/:boardId/sessions/:sessionId/collaborators/:userId - Remove session collaborator
const removeSessionCollaborator = async (req, res) => {
  let payload
  try {
    payload = requireAuth(req)
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message })
  }
  
  const { boardId, sessionId, userId } = req.params
  
  try {
    // Verify access to board
    const accessCheck = await pool.query(
      `SELECT 1 FROM boards WHERE id = $1 AND owner_id = $2
       UNION
       SELECT 1 FROM board_permissions WHERE board_id = $1 AND user_id = $2`,
      [boardId, payload.userId]
    )
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You do not have access to this board' })
    }
    
    const result = await pool.query(
      'DELETE FROM session_permissions WHERE session_id = $1 AND user_id = $2 RETURNING id',
      [sessionId, userId]
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Collaborator not found' })
    }
    
    return res.json({ success: true })
  } catch (err) {
    console.error('[Session Share API] Error removing collaborator:', err)
    return res.status(500).json({ error: 'Failed to remove collaborator' })
  }
}

// PUT /api/boards/:boardId/sessions/:sessionId/privacy - Toggle session privacy
const toggleSessionPrivacy = async (req, res) => {
  let payload
  try {
    payload = requireAuth(req)
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message })
  }
  
  const { boardId, sessionId } = req.params
  const { isPrivate } = req.body
  
  if (typeof isPrivate !== 'boolean') {
    return res.status(400).json({ error: 'isPrivate must be a boolean' })
  }
  
  try {
    // Verify access
    const accessCheck = await pool.query(
      `SELECT 1 FROM boards WHERE id = $1 AND owner_id = $2
       UNION
       SELECT 1 FROM board_permissions WHERE board_id = $1 AND user_id = $2`,
      [boardId, payload.userId]
    )
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You do not have access to this board' })
    }
    
    const result = await pool.query(
      `UPDATE canvas_sessions 
       SET is_private = $1, updated_at = $2 
       WHERE id = $3 AND board_id = $4
       RETURNING id, name, is_private`,
      [isPrivate, Date.now(), sessionId, boardId]
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    return res.json({ session: result.rows[0] })
  } catch (err) {
    console.error('[Session Share API] Error toggling privacy:', err)
    return res.status(500).json({ error: 'Failed to update privacy' })
  }
}

module.exports = {
  shareSession,
  getSessionCollaborators,
  removeSessionCollaborator,
  toggleSessionPrivacy
}
