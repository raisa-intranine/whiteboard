// api/boards/collaborators.js — GET /api/boards/:boardId/collaborators
// Get list of users who have access to a board
// Requires: Authorization: Bearer <jwt>

const pool = require('../../lib/db')
const { requireAuth } = require('../../lib/middleware')

const getCollaborators = async (req, res) => {
    const boardId = req.params.boardId

    if (!boardId) return res.status(400).json({ error: 'boardId is required' })

    let payload
    try {
        payload = requireAuth(req)
    } catch (err) {
        return res.status(err.status || 401).json({ error: err.message })
    }

    try {
        // Get board owner
        const boardResult = await pool.query(
            `SELECT b.owner_id, b.is_public, u.name, u.email
             FROM boards b
             JOIN users u ON u.id = b.owner_id
             WHERE b.id = $1`,
            [boardId]
        )

        if (boardResult.rows.length === 0) {
            return res.status(404).json({ error: 'Board not found' })
        }

        const board = boardResult.rows[0]
        const owner = {
            id: board.owner_id,
            name: board.name,
            email: board.email,
            role: 'owner'
        }

        // Get collaborators
        const collabResult = await pool.query(
            `SELECT u.id, u.name, u.email, bp.role
             FROM board_permissions bp
             JOIN users u ON u.id = bp.user_id
             WHERE bp.board_id = $1`,
            [boardId]
        )

        const collaborators = collabResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            email: row.email,
            role: row.role
        }))

        return res.status(200).json({
            owner,
            collaborators,
            isPublic: board.is_public
        })
    } catch (err) {
        console.error('[boards/collaborators]', err)
        return res.status(500).json({ error: 'Internal server error' })
    }
}

const removeCollaborator = async (req, res) => {
    const boardId = req.params.boardId
    const userId = req.params.userId

    if (!boardId || !userId) {
        return res.status(400).json({ error: 'boardId and userId are required' })
    }

    let payload
    try {
        payload = requireAuth(req)
    } catch (err) {
        return res.status(err.status || 401).json({ error: err.message })
    }

    try {
        // Verify the requester owns this board
        const ownerCheck = await pool.query(
            `SELECT id FROM boards WHERE id = $1 AND owner_id = $2`,
            [boardId, payload.userId]
        )
        
        if (ownerCheck.rows.length === 0) {
            return res.status(403).json({ error: 'You do not own this board' })
        }

        // Remove collaborator
        await pool.query(
            `DELETE FROM board_permissions WHERE board_id = $1 AND user_id = $2`,
            [boardId, userId]
        )

        return res.status(200).json({ ok: true })
    } catch (err) {
        console.error('[boards/collaborators/remove]', err)
        return res.status(500).json({ error: 'Internal server error' })
    }
}

module.exports = { getCollaborators, removeCollaborator }
