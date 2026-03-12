require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '10mb' }))

// Import route handlers
const { googleAuth, googleCallback } = require('./api/auth/google')
const { me } = require('./api/auth/me')
const { getBoards, createBoard } = require('./api/boards/index')
const { getBoard, updateBoard, deleteBoard } = require('./api/boards/[boardId]')
const { shareBoard } = require('./api/boards/share')
const { getCollaborators, removeCollaborator } = require('./api/boards/collaborators')
const { searchUsers } = require('./api/users/search')
const { getRealtimeToken } = require('./api/realtime/token')
const { listSessions, createSession, getSession, updateSession, activateSession, deleteSession } = require('./api/boards/sessions')
const { getHistory, saveHistory, clearHistory } = require('./api/boards/history')
const { shareSession, getSessionCollaborators, removeSessionCollaborator, toggleSessionPrivacy } = require('./api/boards/session-share')

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Whiteboard API is running' })
})

// Auth routes
app.get('/api/auth/google', googleAuth)
app.get('/api/auth/google/callback', googleCallback)
app.get('/api/auth/me', me)

// Board routes
app.get('/api/boards', getBoards)
app.post('/api/boards', createBoard)
app.get('/api/boards/:boardId', getBoard)
app.put('/api/boards/:boardId', updateBoard)
app.delete('/api/boards/:boardId', deleteBoard)
app.post('/api/boards/:boardId/share', shareBoard)
app.get('/api/boards/:boardId/collaborators', getCollaborators)
app.delete('/api/boards/:boardId/collaborators/:userId', removeCollaborator)

// Session routes
app.get('/api/boards/:boardId/sessions', listSessions)
app.post('/api/boards/:boardId/sessions', createSession)
app.get('/api/boards/:boardId/sessions/:sessionId', getSession)
app.put('/api/boards/:boardId/sessions/:sessionId', updateSession)
app.put('/api/boards/:boardId/sessions/:sessionId/activate', activateSession)
app.delete('/api/boards/:boardId/sessions/:sessionId', deleteSession)

// Session sharing routes
app.post('/api/boards/:boardId/sessions/:sessionId/share', shareSession)
app.get('/api/boards/:boardId/sessions/:sessionId/collaborators', getSessionCollaborators)
app.delete('/api/boards/:boardId/sessions/:sessionId/collaborators/:userId', removeSessionCollaborator)
app.put('/api/boards/:boardId/sessions/:sessionId/privacy', toggleSessionPrivacy)

// History routes
app.get('/api/boards/:boardId/history', getHistory)
app.post('/api/boards/:boardId/history', saveHistory)
app.delete('/api/boards/:boardId/history', clearHistory)

// User routes
app.get('/api/users/search', searchUsers)

// Realtime routes
app.get('/api/realtime/token', getRealtimeToken)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`)
})