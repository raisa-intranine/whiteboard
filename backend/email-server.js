require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { sendBoardInvitation, sendSessionInvitation } = require('./lib/email')

const app = express()
const PORT = process.env.EMAIL_PORT || 3002

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}))
app.use(express.json())

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'email-only' })
})

// Send board invitation email
app.post('/api/email/invite-board', async (req, res) => {
  try {
    const { to, boardId, inviterName, inviterEmail } = req.body
    
    if (!to || !boardId || !inviterName || !inviterEmail) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    
    const boardUrl = `${process.env.FRONTEND_URL}?board=${boardId}`
    
    await sendBoardInvitation({
      to,
      boardId,
      boardUrl,
      inviterName,
      inviterEmail
    })
    
    res.json({ success: true, message: 'Invitation sent' })
  } catch (error) {
    console.error('Failed to send board invitation:', error)
    res.status(500).json({ error: 'Failed to send invitation', details: error.message })
  }
})

// Send session invitation email
app.post('/api/email/invite-session', async (req, res) => {
  try {
    const { to, boardId, sessionId, sessionName, inviterName, inviterEmail } = req.body
    
    if (!to || !boardId || !sessionId || !sessionName || !inviterName || !inviterEmail) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    
    const sessionUrl = `${process.env.FRONTEND_URL}?board=${boardId}&session=${sessionId}`
    
    await sendSessionInvitation({
      to,
      boardId,
      sessionId,
      sessionName,
      sessionUrl,
      inviterName,
      inviterEmail
    })
    
    res.json({ success: true, message: 'Invitation sent' })
  } catch (error) {
    console.error('Failed to send session invitation:', error)
    res.status(500).json({ error: 'Failed to send invitation', details: error.message })
  }
})

app.listen(PORT, () => {
  console.log(`Email service running on port ${PORT}`)
  console.log(`SMTP configured: ${process.env.SMTP_USER ? 'Yes' : 'No'}`)
})
