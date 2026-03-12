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
export const saveBoard = (boardId, body) => request('PUT', `/api/boards/${boardId}`, body)

// ── Realtime API ──────────────────────────────────────────────────────────────

/**
 * Get an Ably token request for the authenticated user's board channel.
 * @param {string} boardId - Optional boardId to join a specific board
 * @returns {{ tokenRequest: object }}
 */
export const getRealtimeToken = (boardId, sessionId) => {
    let path = boardId ? `/api/realtime/token?boardId=${boardId}` : '/api/realtime/token'
    if (sessionId) path += `&sessionId=${sessionId}`
    return request('GET', path)
}

// ── Share API ─────────────────────────────────────────────────────────────────

/**
 * Mark a board as publicly shareable (is_public = true).
 * Optionally add a specific collaborator by email.
 * @param {string} boardId
 * @param {string|null} email  - optional collaborator email for private invite
 */
export const shareBoard = (boardId, email = null) =>
    request('POST', `/api/boards/${boardId}/share`, email ? { email } : {})

/**
 * Get list of collaborators for a board
 * @param {string} boardId
 * @returns {{ owner: object, collaborators: array, isPublic: boolean }}
 */
export const getCollaborators = (boardId) =>
    request('GET', `/api/boards/${boardId}/collaborators`)

/**
 * Remove a collaborator from a board
 * @param {string} boardId
 * @param {string} userId
 */
export const removeCollaborator = (boardId, userId) =>
    request('DELETE', `/api/boards/${boardId}/collaborators/${userId}`)

/**
 * Search for users by email
 * @param {string} query - email search query
 * @returns {{ users: array }}
 */
export const searchUsers = (query) =>
    request('GET', `/api/users/search?q=${encodeURIComponent(query)}`)

// ── History API ───────────────────────────────────────────────────────────────

/**
 * Fetch board history snapshots from database for a specific session
 * @param {string} boardId
 * @param {string} sessionId
 * @param {number} limit - Max number of snapshots to fetch (default: 100)
 * @returns {{ history: array }}
 */
export const fetchHistory = (boardId, sessionId, limit = 100) =>
    request('GET', `/api/boards/${boardId}/history?sessionId=${sessionId}&limit=${limit}`)

/**
 * Save a snapshot to board history for a specific session
 * @param {string} boardId
 * @param {string} sessionId
 * @param {{ snapshot: object, createdAt: number }} body
 * @returns {{ success: boolean, id: number, createdAt: number }}
 */
export const saveSnapshot = (boardId, sessionId, body) =>
    request('POST', `/api/boards/${boardId}/history`, { ...body, sessionId })

/**
 * Clear all history for a session (for testing)
 * @param {string} boardId
 * @param {string} sessionId
 * @returns {{ success: boolean }}
 */
export const clearHistory = (boardId, sessionId) =>
    request('DELETE', `/api/boards/${boardId}/history?sessionId=${sessionId}`)

// ── Canvas Sessions API ───────────────────────────────────────────────────────

/**
 * List all canvas sessions for a board
 * @param {string} boardId
 * @returns {{ sessions: array }}
 */
export const listSessions = (boardId) =>
    request('GET', `/api/boards/${boardId}/sessions`)

/**
 * Create a new canvas session
 * @param {string} boardId
 * @param {{ name: string, isPrivate: boolean }} body
 * @returns {{ session: object }}
 */
export const createSession = (boardId, body) =>
    request('POST', `/api/boards/${boardId}/sessions`, body)

/**
 * Get session details and canvas
 * @param {string} boardId
 * @param {string} sessionId
 * @returns {{ session: object }}
 */
export const getSession = (boardId, sessionId) =>
    request('GET', `/api/boards/${boardId}/sessions/${sessionId}`)

/**
 * Update session (save canvas state)
 * @param {string} boardId
 * @param {string} sessionId
 * @param {{ name?: string, canvasJson?: object, background?: string }} body
 * @returns {{ session: object }}
 */
export const updateSession = (boardId, sessionId, body) =>
    request('PUT', `/api/boards/${boardId}/sessions/${sessionId}`, body)

/**
 * Activate a session (make it the current working session)
 * @param {string} boardId
 * @param {string} sessionId
 * @returns {{ session: object }}
 */
export const activateSession = (boardId, sessionId) =>
    request('PUT', `/api/boards/${boardId}/sessions/${sessionId}/activate`)

/**
 * Delete a session
 * @param {string} boardId
 * @param {string} sessionId
 * @returns {{ success: boolean }}
 */
export const deleteSession = (boardId, sessionId) =>
    request('DELETE', `/api/boards/${boardId}/sessions/${sessionId}`)

// ── Session Sharing API ──────────────────────────────────────────────────────

/**
 * Share a session with a user by email
 * @param {string} boardId
 * @param {string} sessionId
 * @param {{ email: string, role?: string }} body
 * @returns {{ success: boolean, collaborator: object }}
 */
export const shareSessionWithUser = (boardId, sessionId, body) =>
    request('POST', `/api/boards/${boardId}/sessions/${sessionId}/share`, body)

/**
 * Get list of session collaborators
 * @param {string} boardId
 * @param {string} sessionId
 * @returns {{ collaborators: array }}
 */
export const getSessionCollaborators = (boardId, sessionId) =>
    request('GET', `/api/boards/${boardId}/sessions/${sessionId}/collaborators`)

/**
 * Remove a collaborator from a session
 * @param {string} boardId
 * @param {string} sessionId
 * @param {string} userId
 * @returns {{ success: boolean }}
 */
export const removeSessionCollaborator = (boardId, sessionId, userId) =>
    request('DELETE', `/api/boards/${boardId}/sessions/${sessionId}/collaborators/${userId}`)

/**
 * Toggle session privacy (private vs accessible by all board members)
 * @param {string} boardId
 * @param {string} sessionId
 * @param {{ isPrivate: boolean }} body
 * @returns {{ session: object }}
 */
export const toggleSessionPrivacy = (boardId, sessionId, body) =>
    request('PUT', `/api/boards/${boardId}/sessions/${sessionId}/privacy`, body)