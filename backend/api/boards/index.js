// api/boards/index.js — GET /api/boards
// Returns list of boards owned by the authenticated user

const pool = require('../../lib/db')
const { requireAuth } = require('../../lib/middleware')

const getBoards = async (req, res) => {
    let payload
    try {
        payload = requireAuth(req)
    } catch (err) {
        return res.status(err.status || 401).json({ error: err.message })
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
        return res.status(500).json({ error: 'Internal server error' })
    }
}

const createBoard = async (req, res) => {
    // Placeholder for creating new boards
    res.status(501).json({ error: 'Not implemented' })
}

module.exports = { getBoards, createBoard }
