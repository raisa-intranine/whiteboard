// api/realtime/token.js — GET /api/realtime/token
// Issues a short-lived Ably token for authenticated users.
// The token grants publish + subscribe access to their board channel.
//
// Requires: Authorization: Bearer <jwt>
// Returns:  { tokenRequest } — pass this directly to Ably client

const Ably = require('ably')
const { requireAuth } = require('../../lib/middleware')

const getRealtimeToken = async (req, res) => {
    let payload
    try {
        payload = requireAuth(req)
    } catch (err) {
        return res.status(err.status || 401).json({ error: err.message })
    }

    const { ABLY_API_KEY } = process.env
    if (!ABLY_API_KEY) {
        console.error('ABLY_API_KEY is not set')
        return res.status(500).json({ error: 'Realtime service not configured' })
    }

    try {
        const client = new Ably.Rest(ABLY_API_KEY)

        // Accept a targeted boardId from query params so guests can join via URL
        // Fallback to the user's own board
        const requestedBoardId = req.query.boardId || payload.boardId
        const boardChannel = `board:${requestedBoardId}`

        const tokenParams = {
            clientId: payload.userId,
            capability: {
                [boardChannel]: ['publish', 'subscribe', 'presence'],
            },
            ttl: 3600 * 1000,
        }

        const tokenRequest = await client.auth.createTokenRequest(tokenParams)
        return res.status(200).json({ tokenRequest })
    } catch (err) {
        console.error('[realtime/token]', err)
        return res.status(500).json({ error: 'Failed to create realtime token' })
    }
}

module.exports = { getRealtimeToken }
