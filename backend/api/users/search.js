// api/users/search.js — GET /api/users/search?q=email
// Search for users by email to share boards with them
// Requires: Authorization: Bearer <jwt>

const pool = require('../../lib/db')
const { requireAuth } = require('../../lib/middleware')

const searchUsers = async (req, res) => {
    let payload
    try {
        payload = requireAuth(req)
    } catch (err) {
        return res.status(err.status || 401).json({ error: err.message })
    }

    const query = req.query.q?.trim().toLowerCase()
    
    if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Query must be at least 2 characters' })
    }

    try {
        // Search for users by email (exclude current user)
        const result = await pool.query(
            `SELECT id, name, email 
             FROM users 
             WHERE email ILIKE $1 AND id != $2
             LIMIT 10`,
            [`%${query}%`, payload.userId]
        )

        return res.status(200).json({ users: result.rows })
    } catch (err) {
        console.error('[users/search]', err)
        return res.status(500).json({ error: 'Internal server error' })
    }
}

module.exports = { searchUsers }