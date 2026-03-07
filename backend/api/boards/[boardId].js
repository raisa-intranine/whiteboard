// api/boards/[boardId].js — GET + PUT + DELETE /api/boards/:boardId
//
// GET    — Load canvas snapshot (public: any user with the boardId can view)
// PUT    — Save canvas snapshot (requires auth; only board owner)
// DELETE — Delete board (requires auth; only board owner)

const pool = require('../../lib/db')
const { requireAuth } = require('../../lib/middleware')

const getBoard = async (req, res) => {
    const boardId = req.params.boardId

    if (!boardId) return res.status(400).json({ error: 'boardId is required' })

    try {
        const result = await pool.query(
            `SELECT bd.canvas_json, bd.background, b.title
         FROM board_data bd
         JOIN boards b ON b.id = bd.board_id
         WHERE bd.board_id = $1`,
            [boardId]
        )

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Board not found' })
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
        return res.status(500).json({ error: 'Internal server error' })
    }
}

const updateBoard = async (req, res) => {
    const boardId = req.params.boardId

    if (!boardId) return res.status(400).json({ error: 'boardId is required' })

    let payload
    try {
        payload = requireAuth(req)
    } catch (err) {
        return res.status(err.status || 401).json({ error: err.message })
    }

    // Verify the authenticated user owns this board
    if (payload.boardId !== boardId) {
        return res.status(403).json({ error: 'You do not have permission to save this board' })
    }

    const { canvasJson, background } = req.body || {}

    if (!canvasJson) return res.status(400).json({ error: 'canvasJson is required' })

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
        console.error('[boards PUT]', err)
        return res.status(500).json({ error: 'Internal server error' })
    }
}

const deleteBoard = async (req, res) => {
    // Placeholder for deleting boards
    res.status(501).json({ error: 'Not implemented' })
}

module.exports = { getBoard, updateBoard, deleteBoard }
