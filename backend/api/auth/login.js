// api/auth/login.js — POST /api/auth/login
// Body: { email, password }
// Returns: { token, user: { id, name, email, boardId } }

const bcrypt = require('bcryptjs')
const pool = require('../../lib/db')
const { signToken } = require('../../lib/auth')

const login = async (req, res) => {
    const { email, password } = req.body || {}

    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })

    const normalizedEmail = email.toLowerCase().trim()

    try {
        const result = await pool.query(
            `SELECT id, name, email, password_hash, board_id FROM users WHERE email = $1`,
            [normalizedEmail]
        )

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'No account found with this email' })
        }

        const user = result.rows[0]
        const match = await bcrypt.compare(password, user.password_hash)

        if (!match) {
            return res.status(401).json({ error: 'Incorrect password' })
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
        return res.status(500).json({ error: 'Internal server error' })
    }
}

module.exports = { login }
