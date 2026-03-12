import { useState, useEffect, useRef } from 'react'
import './SessionManager.css'
import ConfirmDialog from './Confirmdialog'
import Toast from './Toast'
import { 
  listSessions, 
  createSession, 
  activateSession, 
  deleteSession,
  shareSessionWithUser,
  getSessionCollaborators,
  removeSessionCollaborator,
  toggleSessionPrivacy,
  searchUsers
} from '../services/api'

export default function SessionManager({ boardId, currentSessionId, onSessionChange, theme }) {
  const [sessions, setSessions] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')
  const [loading, setLoading] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(null) // sessionId or null
  const [shareEmail, setShareEmail] = useState('')
  const [collaborators, setCollaborators] = useState([])
  const [loadingCollaborators, setLoadingCollaborators] = useState(false)
  const [userSuggestions, setUserSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchTimeoutRef = useRef(null)
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState(null)
  const [removeCollabVisible, setRemoveCollabVisible] = useState(false)
  const [collabToRemove, setCollabToRemove] = useState(null)
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' })

  const showToast = (message, type = 'info') => {
    setToast({ visible: true, message, type })
  }

  const hideToast = () => {
    setToast({ visible: false, message: '', type: 'info' })
  }

  useEffect(() => {
    if (boardId) {
      loadSessions()
    }
  }, [boardId])

  // Reload sessions when currentSessionId changes to update the display
  useEffect(() => {
    if (boardId && currentSessionId) {
      loadSessions()
    }
  }, [currentSessionId])

  const loadSessions = async () => {
    try {
      const { sessions: data } = await listSessions(boardId)
      setSessions(data)
    } catch (err) {
      console.error('Failed to load sessions:', err)
    }
  }

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) return
    
    setLoading(true)
    try {
      await createSession(boardId, { name: newSessionName, isPrivate: false })
      setNewSessionName('')
      setIsCreating(false)
      await loadSessions()
    } catch (err) {
      console.error('Failed to create session:', err)
      showToast('Failed to create session: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSwitchSession = async (sessionId) => {
    if (sessionId === currentSessionId) return
    
    setLoading(true)
    try {
      const { session } = await activateSession(boardId, sessionId)
      await loadSessions() // Reload sessions to update is_active flags
      onSessionChange(session)
      setIsOpen(false)
    } catch (err) {
      console.error('Failed to switch session:', err)
      showToast('Failed to switch session: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSession = (sessionId, e) => {
    e.stopPropagation()
    setSessionToDelete(sessionId)
    setDeleteConfirmVisible(true)
  }

  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return
    
    setDeleteConfirmVisible(false)
    setLoading(true)
    try {
      await deleteSession(boardId, sessionToDelete)
      await loadSessions()
      
      // If deleted current session, switch to first available
      if (sessionToDelete === currentSessionId && sessions.length > 0) {
        const nextSession = sessions.find(s => s.id !== sessionToDelete)
        if (nextSession) {
          await handleSwitchSession(nextSession.id)
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err)
      showToast('Failed to delete session: ' + err.message, 'error')
    } finally {
      setLoading(false)
      setSessionToDelete(null)
    }
  }

  const cancelDeleteSession = () => {
    setDeleteConfirmVisible(false)
    setSessionToDelete(null)
  }

  const handleOpenShareDialog = async (sessionId, e) => {
    e.stopPropagation()
    setShareDialogOpen(sessionId)
    setShareEmail('')
    setUserSuggestions([])
    setShowSuggestions(false)
    setLoadingCollaborators(true)
    try {
      const { collaborators: collabs } = await getSessionCollaborators(boardId, sessionId)
      setCollaborators(collabs)
    } catch (err) {
      console.error('Failed to load collaborators:', err)
    } finally {
      setLoadingCollaborators(false)
    }
  }

  const handleEmailInputChange = async (e) => {
    const value = e.target.value
    setShareEmail(value)
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    // If input is too short, hide suggestions
    if (value.trim().length < 2) {
      setUserSuggestions([])
      setShowSuggestions(false)
      return
    }
    
    // Debounce search by 300ms
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const { users } = await searchUsers(value)
        setUserSuggestions(users)
        setShowSuggestions(users.length > 0)
      } catch (err) {
        console.error('Failed to search users:', err)
        setUserSuggestions([])
        setShowSuggestions(false)
      }
    }, 300)
  }

  const handleSelectUser = (user) => {
    setShareEmail(user.email)
    setShowSuggestions(false)
    setUserSuggestions([])
  }

  const handleShareSession = async (sessionId) => {
    if (!shareEmail.trim()) return
    
    setLoading(true)
    setShowSuggestions(false)
    try {
      const result = await shareSessionWithUser(boardId, sessionId, { email: shareEmail })
      setShareEmail('')
      setUserSuggestions([])
      // Reload collaborators
      const { collaborators: collabs } = await getSessionCollaborators(boardId, sessionId)
      setCollaborators(collabs)
      
      // Show appropriate message
      if (result.emailSent) {
        showToast(`Session shared with ${shareEmail}. Invitation email sent.`, 'success')
      } else {
        showToast(`Session shared with ${shareEmail}. (Email notification could not be sent - check SMTP config)`, 'warning')
      }
    } catch (err) {
      console.error('Failed to share session:', err)
      showToast('Failed to share: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveCollaborator = (sessionId, userId, collabName) => {
    setCollabToRemove({ sessionId, userId, collabName })
    setRemoveCollabVisible(true)
  }

  const confirmRemoveCollaborator = async () => {
    if (!collabToRemove) return
    
    setRemoveCollabVisible(false)
    setLoading(true)
    try {
      await removeSessionCollaborator(boardId, collabToRemove.sessionId, collabToRemove.userId)
      // Reload collaborators
      const { collaborators: collabs } = await getSessionCollaborators(boardId, collabToRemove.sessionId)
      setCollaborators(collabs)
    } catch (err) {
      console.error('Failed to remove collaborator:', err)
      showToast('Failed to remove: ' + err.message, 'error')
    } finally {
      setLoading(false)
      setCollabToRemove(null)
    }
  }

  const cancelRemoveCollaborator = () => {
    setRemoveCollabVisible(false)
    setCollabToRemove(null)
  }

  const handleCopyLink = (sessionId, sessionName, e) => {
    e.stopPropagation()
    const sessionUrl = `${window.location.origin}?board=${boardId}&session=${sessionId}`
    
    navigator.clipboard.writeText(sessionUrl).then(() => {
      showToast(`Link copied for "${sessionName}"! Anyone with this link can access the session.`, 'success')
    }).catch(err => {
      console.error('Failed to copy link:', err)
      showToast('Failed to copy link', 'error')
    })
  }

  const handleTogglePrivacy = async (sessionId, currentPrivacy, e) => {
    e.stopPropagation()
    
    setLoading(true)
    try {
      await toggleSessionPrivacy(boardId, sessionId, { isPrivate: !currentPrivacy })
      await loadSessions()
    } catch (err) {
      console.error('Failed to toggle privacy:', err)
      showToast('Failed to update privacy: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const currentSession = sessions.find(s => s.id === currentSessionId)
  const sessionToDeleteName = sessions.find(s => s.id === sessionToDelete)?.name

  return (
    <>
      <div className={`session-manager ${theme || ''}`}>
      <button 
        className="session-trigger" 
        onClick={() => setIsOpen(!isOpen)}
        title="Switch Canvas Session"
      >
        <span className="session-icon">📋</span>
        <span className="session-name">{currentSession?.name || 'Loading...'}</span>
        <span className="session-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="session-dropdown">
          <div className="session-header">
            <h3>Canvas Sessions</h3>
            <button 
              className="session-close" 
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="session-list">
            {sessions.map(session => (
              <div key={session.id} className="session-item-wrapper">
                <div
                  className={`session-item ${session.id === currentSessionId ? 'active' : ''}`}
                  onClick={() => handleSwitchSession(session.id)}
                >
                  <div className="session-item-info">
                    <span className="session-item-name">{session.name}</span>
                    {session.is_active && <span className="session-badge">Current</span>}
                    {session.is_private && <span className="session-badge private">Private</span>}
                  </div>
                  <div className="session-item-meta">
                    <span className="session-date">
                      {new Date(session.created_at).toLocaleDateString()}
                    </span>
                    <div className="session-actions">
                      <button
                        className="session-action-button"
                        onClick={(e) => handleCopyLink(session.id, session.name, e)}
                        title="Copy shareable link"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                        </svg>
                      </button>
                      <button
                        className="session-action-button"
                        onClick={(e) => handleOpenShareDialog(session.id, e)}
                        title="Share with user"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="18" cy="5" r="3" />
                          <circle cx="6" cy="12" r="3" />
                          <circle cx="18" cy="19" r="3" />
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                      </button>
                      <button
                        className="session-action-button"
                        onClick={(e) => handleTogglePrivacy(session.id, session.is_private, e)}
                        title={session.is_private ? 'Make accessible to all board members' : 'Make private'}
                      >
                        {session.is_private ? '🔒' : '🔓'}
                      </button>
                      {session.id !== currentSessionId && sessions.length > 1 && (
                        <button
                          className="session-delete"
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          title="Delete session"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                
                {shareDialogOpen === session.id && (
                  <div className="session-share-dialog" onClick={(e) => e.stopPropagation()}>
                    <div className="share-dialog-header">
                      <h4>Share "{session.name}"</h4>
                      <button onClick={() => {
                        setShareDialogOpen(null)
                        setShowSuggestions(false)
                        setUserSuggestions([])
                      }}>×</button>
                    </div>
                    
                    <div className="share-input-group">
                      <div className="share-input-wrapper">
                        <input
                          type="email"
                          value={shareEmail}
                          onChange={handleEmailInputChange}
                          placeholder="Enter email address..."
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleShareSession(session.id)
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              setShowSuggestions(false)
                              if (!shareEmail) {
                                setShareDialogOpen(null)
                              }
                            }
                            if (e.key === 'ArrowDown' && userSuggestions.length > 0) {
                              e.preventDefault()
                              setShowSuggestions(true)
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                        
                        {showSuggestions && userSuggestions.length > 0 && (
                          <div className="user-suggestions">
                            {userSuggestions.map(user => (
                              <div
                                key={user.id}
                                className="user-suggestion-item"
                                onClick={() => handleSelectUser(user)}
                              >
                                <div className="user-suggestion-info">
                                  <span className="user-suggestion-name">{user.name}</span>
                                  <span className="user-suggestion-email">{user.email}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <button 
                        onClick={() => handleShareSession(session.id)}
                        disabled={loading || !shareEmail.trim()}
                      >
                        Share
                      </button>
                    </div>
                    
                    {loadingCollaborators ? (
                      <div className="share-loading">Loading collaborators...</div>
                    ) : collaborators.length > 0 ? (
                      <div className="collaborators-list">
                        <h5>Shared with:</h5>
                        {collaborators.map(collab => (
                          <div key={collab.id} className="collaborator-item">
                            <div className="collaborator-info">
                              <span className="collaborator-name">{collab.name}</span>
                              <span className="collaborator-email">{collab.email}</span>
                            </div>
                            <button
                              className="remove-collaborator"
                              onClick={() => handleRemoveCollaborator(session.id, collab.id, collab.name)}
                              title="Remove access"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="share-empty">No collaborators yet</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {isCreating ? (
            <div className="session-create-form">
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="Session name..."
                maxLength={50}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleCreateSession()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setIsCreating(false)
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
              <div className="session-create-actions">
                <button onClick={handleCreateSession} disabled={loading || !newSessionName.trim()}>
                  Create
                </button>
                <button onClick={() => setIsCreating(false)} className="cancel">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button 
              className="session-create-button"
              onClick={() => setIsCreating(true)}
              disabled={loading}
            >
              + New Canvas Session
            </button>
          )}
        </div>
      )}
    </div>

    <ConfirmDialog
      visible={deleteConfirmVisible}
      title="Delete Canvas Session"
      message={`Delete "${sessionToDeleteName}"? This will permanently delete all history for this session.`}
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={confirmDeleteSession}
      onCancel={cancelDeleteSession}
      danger={true}
    />

    <ConfirmDialog
      visible={removeCollabVisible}
      title="Remove Collaborator"
      message={`Remove ${collabToRemove?.collabName || 'this collaborator'} from the session? They will lose access to this canvas.`}
      confirmLabel="Remove"
      cancelLabel="Cancel"
      onConfirm={confirmRemoveCollaborator}
      onCancel={cancelRemoveCollaborator}
      danger={true}
    />

    <Toast
      visible={toast.visible}
      message={toast.message}
      type={toast.type}
      onClose={hideToast}
    />
  </>
  )
}
