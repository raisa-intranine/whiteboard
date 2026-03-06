// src/services/api.js — Centralized fetch wrapper for backend API
// Base URL is read from VITE_API_URL env var (set in your .env file for local dev,
// and in Netlify environment variables for production).

const BASE_URL = import.meta.env.VITE_API_URL || ''

/**
 * Get the stored JWT token.
 */
export const getToken = () => localStorage.getItem('wb_jwt')

/**
 * Store a JWT token.
 */
export const setToken = (token) => localStorage.setItem('wb_jwt', token)

/**
 * Remove the stored JWT token (logout).
 */
export const clearToken = () => localStorage.removeItem('wb_jwt')

/**
 * Core fetch helper.
 * Automatically attaches Authorization header when a token is stored.
 * Throws an Error with the server's error message on non-2xx responses.
 */
const request = async (method, path, body) => {
    const token = getToken()
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
        const err = new Error(data.error || `Request failed (${res.status})`)
        err.status = res.status
        throw err
    }

    return data
}

// ── Auth API ─────────────────────────────────────────────────────────────────

/**
 * Sign up a new user.
 * @param {{ name: string, email: string, password: string }} body
 * @returns {{ token: string, user: object }}
 */
export const signup = (body) => request('POST', '/api/auth/signup', body)

/**
 * Log in an existing user.
 * @param {{ email: string, password: string }} body
 * @returns {{ token: string, user: object }}
 */
export const login = (body) => request('POST', '/api/auth/login', body)

/**
 * Get the currently authenticated user (validates stored token).
 * @returns {{ id: string, name: string, email: string, boardId: string }}
 */
export const getMe = () => request('GET', '/api/auth/me')

// ── Board API ─────────────────────────────────────────────────────────────────

/**
 * Load a board's canvas data.
 * @param {string} boardId
 * @returns {{ boardId, title, canvasJson, background }}
 */
export const loadBoard = (boardId) => request('GET', `/api/boards/${boardId}`)

/**
 * Save a board's canvas data.
 * @param {string} boardId
 * @param {{ canvasJson: object, background: string }} body
 */
export const saveBoard = (boardId, body) => request('POST', `/api/boards/${boardId}`, body)

// ── Realtime API ──────────────────────────────────────────────────────────────

/**
 * Get an Ably token request for the authenticated user's board channel.
 * @returns {{ tokenRequest: object }}
 */
export const getRealtimeToken = () => request('GET', '/api/realtime/token')
