// api/boards/index.js — GET /api/boards
// Returns list of boards owned by the authenticated user

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
            `SELECT b.id, b.title, b.created_at, b.updated_at
       FROM boards b
       WHERE b.owner_id = $1
       ORDER BY b.updated_at DESC`,
            [payload.userId]
        )

        return res.status(200).json({ boards: result.rows })
    } catch (err) {
        console.error('[boards list]', err)
        return sendError(res, 500, 'Internal server error')
    }
}
