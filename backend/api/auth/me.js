// api/auth/me.js — GET /api/auth/me
// Requires: Authorization: Bearer <token>
// Returns: { id, name, email, boardId }

const pool = require('../../lib/db')
const { applyCors, requireAuth, sendError } = require('../../lib/middleware')

module.exports = async (req, res) => {
    if (applyCors(req, res)) return

    if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed')

    let payload
    try {
        payload = requireAuth(req)
    } catch (err) {
        return sendError(res, err.status || 401, err.message)
    }

    try {
        const result = await pool.query(
            `SELECT id, name, email, board_id FROM users WHERE id = $1`,
            [payload.userId]
        )

        if (result.rows.length === 0) {
            return sendError(res, 404, 'User not found')
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
        return sendError(res, 500, 'Internal server error')
    }
}
