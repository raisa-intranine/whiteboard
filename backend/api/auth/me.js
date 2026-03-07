// api/auth/me.js — GET /api/auth/me
// Requires: Authorization: Bearer <token>
// Returns: { id, name, email, boardId }

const pool = require('../../lib/db')
const { requireAuth } = require('../../lib/middleware')

const me = async (req, res) => {
    let payload
    try {
        payload = requireAuth(req)
    } catch (err) {
        return res.status(err.status || 401).json({ error: err.message })
    }

    try {
        const result = await pool.query(
            `SELECT id, name, email, board_id FROM users WHERE id = $1`,
            [payload.userId]
        )

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' })
        }

        const user = result.rows[0]
        return res.status(200).json({
            id: user.id,
            name: user.name,
            email: user.email,
            boardId: user.board_id,
        })
    } catch (err) {
        console.error('[me]', err)
        return res.status(500).json({ error: 'Internal server error' })
    }
}

module.exports = { me }
