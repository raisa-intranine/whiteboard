// lib/auth.js — JWT helpers
require('dotenv').config()
const jwt = require('jsonwebtoken')

const SECRET = process.env.JWT_SECRET
if (!SECRET) throw new Error('JWT_SECRET env var is not set')

/**
 * Sign a JWT token.
 * @param {object} payload  e.g. { userId, email, boardId }
 * @returns {string}
 */
const signToken = (payload) =>
    jwt.sign(payload, SECRET, { expiresIn: '30d' })

/**
 * Verify a JWT token.
 * @param {string} token
 * @returns {object} decoded payload
 * @throws if invalid or expired
 */
const verifyToken = (token) => jwt.verify(token, SECRET)

module.exports = { signToken, verifyToken }
