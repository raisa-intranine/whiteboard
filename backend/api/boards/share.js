// api/boards/share.js — POST /api/boards/:boardId/share
//
// Marks a board as public (is_public = true) so anyone with the link can view/edit.
// Optionally also accepts { email } to add a specific collaborator by email.
//
// Requires: Authorization: Bearer <jwt>
// Body (optional): { email: string }

const pool = require('../../lib/db')
const { requireAuth } = require('../../lib/middleware')
const { sendBoardInvitation } = require('../../lib/email')

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

        // Get owner info for email
        const ownerInfo = await pool.query(
            `SELECT name, email FROM users WHERE id = $1`,
            [payload.userId]
        )
        const inviter = ownerInfo.rows[0]

        // Mark board as public
        await pool.query(
            `UPDATE boards SET is_public = true, updated_at = now() WHERE id = $1`,
            [boardId]
        )

        // Optional: add a specific collaborator by email (Private Invite)
        const { email } = req.body || {}
        if (email) {
            const userResult = await pool.query(
                `SELECT id, name, email FROM users WHERE email = $1`,
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

            const collaborator = userResult.rows[0]
            let emailSent = false
            
            // Don't add the owner as a collaborator
            if (collaborator.id !== payload.userId) {
                await pool.query(
                    `INSERT INTO board_permissions (board_id, user_id, role)
                     VALUES ($1, $2, 'editor')
                     ON CONFLICT (board_id, user_id) DO NOTHING`,
                    [boardId, collaborator.id]
                )

                // Send email invitation (optional - gracefully handle missing SMTP config)
                try {
                    const boardUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}?board=${boardId}`
                    await sendBoardInvitation({
                        to: collaborator.email,
                        boardId,
                        boardUrl,
                        inviterName: inviter.name,
                        inviterEmail: inviter.email,
                    })
                    emailSent = true
                    console.log('[boards/share] Email invitation sent to', collaborator.email)
                } catch (emailErr) {
                    console.warn('[boards/share] Failed to send email invitation:', emailErr.message)
                    console.warn('[boards/share] Collaborator was added successfully, but email notification failed')
                    // Don't fail the request - collaborator was added successfully
                }
            }

            return res.status(200).json({
                ok: true,
                isPublic: true,
                collaboratorAdded: email,
                emailSent,
            })
        }

        return res.status(200).json({ ok: true, isPublic: true })
    } catch (err) {
        console.error('[boards/share]', err)
        return res.status(500).json({ error: 'Internal server error' })
    }
}

module.exports = { shareBoard }
