// api/auth/login.js — POST /api/auth/login
// Body: { email, password }
// Returns: { token, user: { id, name, email, boardId } }

const bcrypt = require('bcryptjs')
const pool = require('../../lib/db')
const { signToken } = require('../../lib/auth')
const { applyCors, sendError } = require('../../lib/middleware')

module.exports = async (req, res) => {
    if (applyCors(req, res)) return

    if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed')

    const { email, password } = req.body || {}

    if (!email || !password) return sendError(res, 400, 'Email and password are required')

    const normalizedEmail = email.toLowerCase().trim()

    try {
        const result = await pool.query(
            `SELECT id, name, email, password_hash, board_id FROM users WHERE email = $1`,
            [normalizedEmail]
        )

        if (result.rows.length === 0) {
            return sendError(res, 401, 'No account found with this email')
        }

        const user = result.rows[0]
        const match = await bcrypt.compare(password, user.password_hash)

        if (!match) {
            return sendError(res, 401, 'Incorrect password')
        }

        const token = signToken({ userId: user.id, email: user.email, boardId: user.board_id })

        return res.status(200).json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                boardId: user.board_id,
            },
        })
    } catch (err) {
        console.error('[login]', err)
        return sendError(res, 500, 'Internal server error')
    }
}
