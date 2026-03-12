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
        const sessionId = req.query.sessionId
        const boardChannel = `board:${requestedBoardId}`
        const sessionChannel = sessionId ? `board:${requestedBoardId}:session:${sessionId}` : null

        // Use userId + random suffix so each browser tab/device gets a unique clientId.
        // This allows the same user account to appear once per connection rather than
        // being filtered out as "own presence" by the other side.
        const uniqueClientId = `${payload.userId}:${Math.random().toString(36).slice(2, 10)}`

        console.log('[realtime/token] Creating token for user:', payload.email)
        console.log('[realtime/token]   - clientId:', uniqueClientId)
        console.log('[realtime/token]   - boardId:', requestedBoardId)
        console.log('[realtime/token]   - sessionId:', sessionId || '(none)')
        console.log('[realtime/token]   - channels:', sessionChannel ? [boardChannel, sessionChannel] : [boardChannel])

        const capability = {
            [boardChannel]: ['publish', 'subscribe', 'presence'],
        }
        if (sessionChannel) {
            capability[sessionChannel] = ['publish', 'subscribe', 'presence']
        }

        const tokenParams = {
            clientId: uniqueClientId,
            capability,
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