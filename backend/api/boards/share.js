// api/boards/share.js — POST /api/boards/:boardId/share
//
// Marks a board as public (is_public = true) so anyone with the link can view/edit.
// Optionally also accepts { email } to add a specific collaborator by email.
//
// Requires: Authorization: Bearer <jwt>
// Body (optional): { email: string }

const pool = require('../../lib/db')
const { requireAuth } = require('../../lib/middleware')

const shareBoard = async (req, res) => {
    const boardId = req.params.boardId

    if (!boardId) return res.status(400).json({ error: 'boardId is required' })

    // Must be authenticated
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

        // Mark board as public
        await pool.query(
            `UPDATE boards SET is_public = true, updated_at = now() WHERE id = $1`,
            [boardId]
        )

        // Optional: add a specific collaborator by email (Private Invite)
        const { email } = req.body || {}
        if (email) {
            const userResult = await pool.query(
                `SELECT id FROM users WHERE email = $1`,
                [email.trim().toLowerCase()]
            )
            if (userResult.rows.length === 0) {
                // Board is still marked public, but warn that email was not found
                return res.status(200).json({
                    ok: true,
                    isPublic: true,
                    warning: `No user found with email ${email}. Board is now public — anyone with the link can access it.`,
                })
            }

            const collaboratorId = userResult.rows[0].id
            // Don't add the owner as a collaborator
            if (collaboratorId !== payload.userId) {
                await pool.query(
                    `INSERT INTO board_permissions (board_id, user_id, role)
                     VALUES ($1, $2, 'editor')
                     ON CONFLICT (board_id, user_id) DO NOTHING`,
                    [boardId, collaboratorId]
                )
            }

            return res.status(200).json({
                ok: true,
                isPublic: true,
                collaboratorAdded: email,
            })
        }

        return res.status(200).json({ ok: true, isPublic: true })
    } catch (err) {
        console.error('[boards/share]', err)
        return res.status(500).json({ error: 'Internal server error' })
    }
}

module.exports = { shareBoard }
