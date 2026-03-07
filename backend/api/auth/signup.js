// api/auth/signup.js — POST /api/auth/signup
// Body: { name, email, password }
// Returns: { token, user: { id, name, email, boardId } }

const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')
const pool = require('../../lib/db')
const { signToken } = require('../../lib/auth')

const signup = async (req, res) => {
    const { name, email, password } = req.body || {}

    // ── Validation ────────────────────────────────────────────────────────────
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' })
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' })
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

    const normalizedEmail = email.toLowerCase().trim()

    try {
        // ── Check for existing user ───────────────────────────────────────────
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail])
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'An account with this email already exists' })
        }

        // ── Hash password ─────────────────────────────────────────────────────
        const passwordHash = await bcrypt.hash(password, 12)
        const boardId = uuidv4()

        // ── Insert user + board in a transaction ──────────────────────────────
        const client = await pool.connect()
        try {
            await client.query('BEGIN')

            const userResult = await client.query(
                `INSERT INTO users (name, email, password_hash, board_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, board_id`,
                [name.trim(), normalizedEmail, passwordHash, boardId]
            )
            const user = userResult.rows[0]

            await client.query(
                `INSERT INTO boards (id, owner_id, title) VALUES ($1, $2, $3)`,
                [boardId, user.id, `${name.trim()}'s Whiteboard`]
            )

            await client.query(
                `INSERT INTO board_data (board_id, canvas_json, background) VALUES ($1, $2, $3)`,
                [boardId, JSON.stringify({ version: '5.3.0', objects: [] }), '#ffffff']
            )

            await client.query('COMMIT')

            const token = signToken({ userId: user.id, email: user.email, boardId: user.board_id })

            return res.status(201).json({
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    boardId: user.board_id,
                },
            })
        } catch (err) {
            await client.query('ROLLBACK')
            throw err
        } finally {
            client.release()
        }
    } catch (err) {
        console.error('[signup]', err)
        return res.status(500).json({ error: 'Internal server error' })
    }
}

module.exports = { signup }
