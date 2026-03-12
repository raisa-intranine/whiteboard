const nodemailer = require('nodemailer')

// Create reusable transporter
const createTransporter = () => {
  // Use environment variables for SMTP configuration
  const config = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS?.replace(/\s+/g, ''), // Remove spaces from app password
    },
  }

  // If no SMTP credentials, log warning and return null
  if (!config.auth.user || !config.auth.pass) {
    console.warn('[Email] SMTP credentials not configured. Email notifications disabled.')
    console.warn('[Email] Set SMTP_USER and SMTP_PASS in .env file')
    return null
  }

  return nodemailer.createTransport(config)
}

// Send board invitation email
const sendBoardInvitation = async ({ to, boardId, boardUrl, inviterName, inviterEmail }) => {
  const transporter = createTransporter()
  
  if (!transporter) {
    console.log('[Email] Skipping email to', to, '- SMTP not configured')
    throw new Error('SMTP not configured')
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `${inviterName} invited you to collaborate on a whiteboard`,
    html: `
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
    text: `
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
    `.trim(),
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    console.log('[Email] Sent invitation to', to, '- Message ID:', info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('[Email] Failed to send to', to, ':', error.message)
    throw error
  }
}

// Send session invitation email
const sendSessionInvitation = async ({ to, boardId, sessionId, sessionName, sessionUrl, inviterName, inviterEmail }) => {
  const transporter = createTransporter()
  
  if (!transporter) {
    console.log('[Email] Skipping email to', to, '- SMTP not configured')
    throw new Error('SMTP not configured')
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `${inviterName} shared a canvas session "${sessionName}" with you`,
    html: `
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
    text: `
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
    `.trim(),
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    console.log('[Email] Sent session invitation to', to, '- Message ID:', info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('[Email] Failed to send to', to, ':', error.message)
    throw error
  }
}

module.exports = {
  sendBoardInvitation,
  sendSessionInvitation,
}
