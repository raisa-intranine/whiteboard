// api/boards/[boardId].js — GET + POST /api/boards/:boardId
//
// GET  — Load canvas snapshot (public: any user with the boardId can view)
// POST — Save canvas snapshot (requires auth; only board owner)

const pool = require('../../lib/db')
const { applyCors, requireAuth, sendError } = require('../../lib/middleware')

module.exports = async (req, res) => {
    if (applyCors(req, res)) return

    // Vercel populates req.query with path segments when using [boardId].js
    const boardId = req.query.boardId

    if (!boardId) return sendError(res, 400, 'boardId is required')

    // ── GET: Load board ───────────────────────────────────────────────────────
    if (req.method === 'GET') {
        try {
            const result = await pool.query(
                `SELECT bd.canvas_json, bd.background, b.title
         FROM board_data bd
         JOIN boards b ON b.id = bd.board_id
         WHERE bd.board_id = $1`,
                [boardId]
            )

            if (result.rows.length === 0) {
                return sendError(res, 404, 'Board not found')
            }

            const row = result.rows[0]
            return res.status(200).json({
                boardId,
                title: row.title,
                canvasJson: row.canvas_json,
                background: row.background,
            })
        } catch (err) {
            console.error('[boards GET]', err)
            return sendError(res, 500, 'Internal server error')
        }
    }

    // ── POST: Save board ──────────────────────────────────────────────────────
    if (req.method === 'POST') {
        let payload
        try {
            payload = requireAuth(req)
        } catch (err) {
            return sendError(res, err.status || 401, err.message)
        }

        // Verify the authenticated user owns this board
        if (payload.boardId !== boardId) {
            return sendError(res, 403, 'You do not have permission to save this board')
        }

        const { canvasJson, background } = req.body || {}

        if (!canvasJson) return sendError(res, 400, 'canvasJson is required')

        try {
            await pool.query(
                `INSERT INTO board_data (board_id, canvas_json, background, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (board_id) DO UPDATE
           SET canvas_json = EXCLUDED.canvas_json,
               background  = EXCLUDED.background,
               updated_at  = now()`,
                [boardId, JSON.stringify(canvasJson), background || '#ffffff']
            )

            await pool.query(
                `UPDATE boards SET updated_at = now() WHERE id = $1`,
                [boardId]
            )

            return res.status(200).json({ ok: true })
        } catch (err) {
            console.error('[boards POST]', err)
            return sendError(res, 500, 'Internal server error')
        }
    }

    return sendError(res, 405, 'Method not allowed')
}
