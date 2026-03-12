// api/auth/google.js — Google OAuth handlers
const { v4: uuidv4 } = require('uuid')
const pool = require('../../lib/db')
const { signToken } = require('../../lib/auth')

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/google/callback`
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

const googleAuth = (req, res) => {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=profile email&access_type=offline&prompt=consent`
    res.redirect(authUrl)
}

const googleCallback = async (req, res) => {
    const { code } = req.query
    if (!code) {
        return res.redirect(`${FRONTEND_URL}?error=oauth_failed`)
    }

    try {
        // Exchange code for token
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI,
            }),
        })

        const tokenData = await tokenRes.json()
        if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Failed to exchange token')

        // Get user info
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })

        const userData = await userRes.json()
        if (!userRes.ok) throw new Error(userData.error?.message || 'Failed to get user info')

        const email = userData.email.toLowerCase().trim()
        const name = userData.name || userData.given_name || email.split('@')[0]

        // Find or create user
        let userResult = await pool.query('SELECT id, name, email, board_id FROM users WHERE email = $1', [email])
        let user = userResult.rows[0]

        if (!user) {
            const boardId = uuidv4()
            const client = await pool.connect()
            try {
                await client.query('BEGIN')
                const insertUser = await client.query(
                    `INSERT INTO users (name, email, board_id) VALUES ($1, $2, $3) RETURNING id, name, email, board_id`,
                    [name, email, boardId]
                )
                user = insertUser.rows[0]

                await client.query(
                    `INSERT INTO boards (id, owner_id, title) VALUES ($1, $2, $3)`,
                    [boardId, user.id, `${name}'s Whiteboard`]
                )

                await client.query(
                    `INSERT INTO board_data (board_id, canvas_json, background) VALUES ($1, $2, $3)`,
                    [boardId, JSON.stringify({ version: '5.3.0', objects: [] }), '#ffffff']
                )

                await client.query('COMMIT')
            } catch (err) {
                await client.query('ROLLBACK')
                throw err
            } finally {
                client.release()
            }
        }

        const token = signToken({ userId: user.id, email: user.email, boardId: user.board_id })

        // Redirect back to frontend with the token
        res.redirect(`${FRONTEND_URL}?token=${token}`)

    } catch (err) {
        console.error('[googleCallback]', err)
        res.redirect(`${FRONTEND_URL}?error=internal_error`)
    }
}

module.exports = { googleAuth, googleCallback }
