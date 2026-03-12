// lib/middleware.js — shared request helpers for Vercel serverless functions
const { verifyToken } = require('./auth')

/**
 * Apply CORS headers and handle OPTIONS preflight.
 * Returns true if the request was an OPTIONS preflight (caller should return immediately).
 */
const applyCors = (req, res) => {
    const origin = req.headers.origin || '*'
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    )

    if (req.method === 'OPTIONS') {
        res.status(204).end()
        return true
    }
    return false
}

/**
 * Extract and verify the Bearer JWT from the Authorization header.
 * Returns the decoded payload or throws { status, message }.
 */
const requireAuth = (req) => {
    const header = req.headers.authorization || ''
    if (!header.startsWith('Bearer ')) {
        const err = new Error('Missing or malformed Authorization header')
        err.status = 401
        throw err
    }
    const token = header.slice(7)
    try {
        return verifyToken(token)
    } catch {
        const err = new Error('Invalid or expired token')
        err.status = 401
        throw err
    }
}

/**
 * Send a JSON error response.
 */
const sendError = (res, status, message) => {
    res.status(status).json({ error: message })
}

module.exports = { applyCors, requireAuth, sendError }
