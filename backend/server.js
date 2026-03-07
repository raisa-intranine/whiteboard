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
app.use(express.json())

// Import route handlers
const { signup } = require('./api/auth/signup')
const { login } = require('./api/auth/login')
const { me } = require('./api/auth/me')
const { getBoards, createBoard } = require('./api/boards/index')
const { getBoard, updateBoard, deleteBoard } = require('./api/boards/[boardId]')
const { getRealtimeToken } = require('./api/realtime/token')

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Whiteboard API is running' })
})

// Auth routes
app.post('/api/auth/signup', signup)
app.post('/api/auth/login', login)
app.get('/api/auth/me', me)

// Board routes
app.get('/api/boards', getBoards)
app.post('/api/boards', createBoard)
app.get('/api/boards/:boardId', getBoard)
app.put('/api/boards/:boardId', updateBoard)
app.delete('/api/boards/:boardId', deleteBoard)

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
