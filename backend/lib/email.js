const { BrevoClient } = require('@getbrevo/brevo')

// Create Brevo client
const createBrevoClient = () => {
  const apiKey = process.env.BREVO_API_KEY
  
  if (!apiKey) {
    console.warn('[Email] Brevo API key not configured. Email notifications disabled.')
    console.warn('[Email] Set BREVO_API_KEY in .env file')
    return null
  }

  return new BrevoClient({ apiKey })
}

// Send board invitation email
const sendBoardInvitation = async ({ to, boardId, boardUrl, inviterName, inviterEmail }) => {
  const client = createBrevoClient()
  
  if (!client) {
    console.log('[Email] Skipping email to', to, '- Brevo not configured')
    throw new Error('Brevo not configured')
  }

  const emailData = {
    sender: { 
      email: process.env.BREVO_SENDER_EMAIL || inviterEmail,
      name: process.env.BREVO_SENDER_NAME || 'Whiteboard'
    },
    to: [{ email: to }],
    subject: `${inviterName} invited you to collaborate on a whiteboard`,
    htmlContent: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #1a73e8; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          .info { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #1a73e8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">🎨 Whiteboard Invitation</h1>
          </div>
          <div class="content">
            <p>Hi there!</p>
            <p><strong>${inviterName}</strong> (${inviterEmail}) has invited you to collaborate on a whiteboard.</p>
            
            <div class="info">
              <p style="margin: 0;"><strong>What you can do:</strong></p>
              <ul style="margin: 10px 0;">
                <li>View and edit the whiteboard in real-time</li>
                <li>Draw shapes, add text, and create diagrams</li>
                <li>Collaborate with other team members</li>
                <li>See who's online and editing</li>
              </ul>
            </div>

            <div style="text-align: center;">
              <a href="${boardUrl}" class="button">Open Whiteboard</a>
            </div>

            <p style="font-size: 14px; color: #6b7280;">
              Or copy and paste this link into your browser:<br>
              <a href="${boardUrl}" style="color: #1a73e8;">${boardUrl}</a>
            </p>
          </div>
          <div class="footer">
            <p>This invitation was sent by ${inviterName}. If you didn't expect this, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    textContent: `
${inviterName} invited you to collaborate on a whiteboard

Hi there!

${inviterName} (${inviterEmail}) has invited you to collaborate on a whiteboard.

What you can do:
- View and edit the whiteboard in real-time
- Draw shapes, add text, and create diagrams
- Collaborate with other team members
- See who's online and editing

Open the whiteboard: ${boardUrl}

This invitation was sent by ${inviterName}. If you didn't expect this, you can safely ignore this email.
    `.trim()
  }

  try {
    const result = await client.transactionalEmails.sendTransacEmail(emailData)
    console.log('[Email] Sent invitation to', to, '- Message ID:', result.messageId)
    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error('[Email] Failed to send to', to, ':', error)
    throw error
  }
}

// Send session invitation email
const sendSessionInvitation = async ({ to, boardId, sessionId, sessionName, sessionUrl, inviterName, inviterEmail }) => {
  const client = createBrevoClient()
  
  if (!client) {
    console.log('[Email] Skipping email to', to, '- Brevo not configured')
    throw new Error('Brevo not configured')
  }

  const emailData = {
    sender: { 
      email: process.env.BREVO_SENDER_EMAIL || inviterEmail,
      name: process.env.BREVO_SENDER_NAME || 'Whiteboard'
    },
    to: [{ email: to }],
    subject: `${inviterName} shared a canvas session "${sessionName}" with you`,
    htmlContent: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #1a73e8; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          .info { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #1a73e8; }
          .session-name { font-size: 18px; font-weight: 600; color: #1a73e8; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">📋 Canvas Session Shared</h1>
          </div>
          <div class="content">
            <p>Hi there!</p>
            <p><strong>${inviterName}</strong> (${inviterEmail}) has shared a canvas session with you:</p>
            
            <div class="session-name">"${sessionName}"</div>

            <div class="info">
              <p style="margin: 0;"><strong>What you can do:</strong></p>
              <ul style="margin: 10px 0;">
                <li>View and edit this specific canvas session</li>
                <li>Collaborate in real-time with other members</li>
                <li>Access your own drawings and history in this session</li>
                <li>See who's currently editing</li>
              </ul>
            </div>

            <div style="text-align: center;">
              <a href="${sessionUrl}" class="button">Open Canvas Session</a>
            </div>

            <p style="font-size: 14px; color: #6b7280;">
              Or copy and paste this link into your browser:<br>
              <a href="${sessionUrl}" style="color: #1a73e8;">${sessionUrl}</a>
            </p>
          </div>
          <div class="footer">
            <p>This invitation was sent by ${inviterName}. If you didn't expect this, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    textContent: `
${inviterName} shared a canvas session with you

Hi there!

${inviterName} (${inviterEmail}) has shared a canvas session "${sessionName}" with you.

What you can do:
- View and edit this specific canvas session
- Collaborate in real-time with other members
- Access your own drawings and history in this session
- See who's currently editing

Open the session: ${sessionUrl}

This invitation was sent by ${inviterName}. If you didn't expect this, you can safely ignore this email.
    `.trim()
  }

  try {
    const result = await client.transactionalEmails.sendTransacEmail(emailData)
    console.log('[Email] Sent session invitation to', to, '- Message ID:', result.messageId)
    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error('[Email] Failed to send to', to, ':', error)
    throw error
  }
}

module.exports = {
  sendBoardInvitation,
  sendSessionInvitation,
}
