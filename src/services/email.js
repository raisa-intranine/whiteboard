// Email service - calls backend email server (deployed separately)

const API_URL = import.meta.env.VITE_EMAIL_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:3001'

console.log('[Email Service] Using API URL:', API_URL)

/**
 * Send board invitation email
 */
export const sendBoardInvite = async (email, boardId, inviterName, inviterEmail) => {
  try {
    const response = await fetch(`${API_URL}/api/email/invite-board`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        boardId,
        inviterName,
        inviterEmail
      })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.details || error.error || 'Failed to send email')
    }
    
    return await response.json()
  } catch (error) {
    console.error('Failed to send board invite:', error)
    throw error
  }
}

/**
 * Send session invitation email
 */
export const sendSessionInvite = async (email, boardId, sessionId, sessionName, inviterName, inviterEmail) => {
  try {
    console.log('[Email Service] Sending session invite to:', email, 'via', API_URL)
    const response = await fetch(`${API_URL}/api/email/invite-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        boardId,
        sessionId,
        sessionName,
        inviterName,
        inviterEmail
      })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.details || error.error || 'Failed to send email')
    }
    
    return await response.json()
  } catch (error) {
    console.error('Failed to send session invite:', error)
    throw error
  }
}
