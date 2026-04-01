import { useState, useEffect, useRef } from 'react'
import './SessionManager.css'
import ConfirmDialog from './Confirmdialog'
import Toast from './Toast'
import { 
  getSessions,
  createSession as firestoreCreateSession,
  getSession,
  updateSession,
  deleteSession as firestoreDeleteSession,
  addSessionCollaborator,
  removeSessionCollaborator,
  getSessionCollaborators,
  searchUsers,
  updateSessionCollaboratorRole
} from '../services/firestore'
import { sendSessionInvite } from '../services/email'
import { auth } from '../services/firebase'

export default function SessionManager({ boardId, currentSessionId, onSessionChange, theme, currentUser }) {
  const [sessions, setSessions] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')
  const [newSessionPrivate, setNewSessionPrivate] = useState(false) // Track if new session should be private
  const [loading, setLoading] = useState(false)
  const [sharingSessionId, setSharingSessionId] = useState(null) // Track which session is being shared
  const [switchingToSessionId, setSwitchingToSessionId] = useState(null) // Track which session is being switched to
  const [shareDialogOpen, setShareDialogOpen] = useState(null) // sessionId or null
  const [shareEmail, setShareEmail] = useState('')
  const [collaborators, setCollaborators] = useState([])
  const [loadingCollaborators, setLoadingCollaborators] = useState(false)
  // Store collaborators for all sessions
  const [sessionCollaborators, setSessionCollaborators] = useState({}) // { sessionId: [collaborators] }
  const [userSuggestions, setUserSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedRole, setSelectedRole] = useState('editor')
  const searchTimeoutRef = useRef(null)
  const shareDialogRef = useRef(null)
  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 })
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

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e) => {
      // Don't close while a confirm dialog is open
      if (deleteConfirmVisible || removeCollabVisible) return
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setIsOpen(false)
        setIsCreating(false)
      }
    }

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, deleteConfirmVisible, removeCollabVisible])

  // Close share dialog when clicking outside
  useEffect(() => {
    if (!shareDialogOpen) return
    
    const handleClickOutside = (e) => {
      if (shareDialogRef.current && !shareDialogRef.current.contains(e.target)) {
        setShareDialogOpen(null)
        setShowSuggestions(false)
        setUserSuggestions([])
      }
    }
    
    // Add small delay to prevent immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)
    
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [shareDialogOpen])

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
      const data = await getSessions(boardId)
      setSessions(data)
      
      // Load collaborators for each session to display in the list
      const collabMap = {}
      for (const session of data) {
        try {
          const { collaborators: sessionCollabs } = await getSessionCollaborators(boardId, session.id)
          collabMap[session.id] = sessionCollabs
        } catch (err) {
          console.warn('Failed to load collaborators for session', session.id, err)
          collabMap[session.id] = []
        }
      }
      setSessionCollaborators(collabMap)
    } catch (err) {
      console.error('Failed to load sessions:', err)
    }
  }

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) return
    
    setLoading(true)
    try {
      await firestoreCreateSession(boardId, newSessionName, newSessionPrivate)
      setNewSessionName('')
      setNewSessionPrivate(false)
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
    
    setSwitchingToSessionId(sessionId)
    try {
      const session = await getSession(boardId, sessionId)
      await loadSessions()
      onSessionChange(session)
      setIsOpen(false)
    } catch (err) {
      console.error('Failed to switch session:', err)
      showToast('Failed to switch session: ' + err.message, 'error')
    } finally {
      setSwitchingToSessionId(null)
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
      await firestoreDeleteSession(boardId, sessionToDelete)
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
      // Get session-specific collaborators
      const { collaborators: sessionCollaborators } = await getSessionCollaborators(boardId, sessionId)
      setCollaborators(sessionCollaborators)
    } catch (err) {
      console.error('Failed to load collaborators:', err)
      setCollaborators([])
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
    
    setSharingSessionId(sessionId)
    setShowSuggestions(false)
    try {
      const result = await addSessionCollaborator(boardId, sessionId, shareEmail, selectedRole)
      const user = auth.currentUser
      const session = await getSession(boardId, sessionId)
      
      // Always send email notification (for both new invites and existing users)
      try {
        await sendSessionInvite(
          shareEmail, 
          boardId, 
          sessionId, 
          session.name,
          user.displayName || user.email, 
          user.email
        )
        
        if (result.invited) {
          showToast(`Invitation email sent to ${shareEmail}!`, 'success')
        } else {
          showToast(`Session shared with ${shareEmail} (email sent)`, 'success')
        }
      } catch (emailErr) {
        console.error('Failed to send email:', emailErr)
        if (result.invited) {
          showToast(`${shareEmail} invited (email notification failed)`, 'success')
        } else {
          showToast(`Session shared with ${shareEmail} (email notification failed)`, 'success')
        }
      }
      
      setShareEmail('')
      setUserSuggestions([])
      
      // Reload collaborators to show updated list
      const { collaborators: sessionCollaborators } = await getSessionCollaborators(boardId, sessionId)
      setCollaborators(sessionCollaborators)
      
      // Update the session collaborators map
      setSessionCollaborators(prev => ({
        ...prev,
        [sessionId]: sessionCollaborators
      }))
    } catch (err) {
      console.error('Failed to share session:', err)
      showToast('Failed to share: ' + err.message, 'error')
    } finally {
      setSharingSessionId(null)
    }
  }

  const handleRoleChange = async (sessionId, userId, newRole) => {
    try {
      await updateSessionCollaboratorRole(boardId, sessionId, userId, newRole)
      // Reload collaborators
      const { collaborators: sessionCollaborators } = await getSessionCollaborators(boardId, sessionId)
      setCollaborators(sessionCollaborators)
      
      // Update the session collaborators map
      setSessionCollaborators(prev => ({
        ...prev,
        [sessionId]: sessionCollaborators
      }))
    } catch (err) {
      console.error('Failed to update role:', err)
      showToast('Failed to update role: ' + err.message, 'error')
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
      // Reload collaborators to get updated list
      const { collaborators: sessionCollaborators } = await getSessionCollaborators(boardId, collabToRemove.sessionId)
      setCollaborators(sessionCollaborators)
      
      // Update the session collaborators map
      setSessionCollaborators(prev => ({
        ...prev,
        [collabToRemove.sessionId]: sessionCollaborators
      }))
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
      await updateSession(boardId, sessionId, { isPrivate: !currentPrivacy })
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
        ref={triggerRef}
        className="session-trigger" 
        onClick={() => {
          if (!isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect()
            const dropdownWidth = Math.min(320, window.innerWidth - 16)
            const rightFromEdge = window.innerWidth - rect.right
            // Clamp so dropdown doesn't go off left edge
            const clampedRight = Math.min(rightFromEdge, window.innerWidth - dropdownWidth - 8)
            setDropdownPos({
              top: rect.bottom + 8,
              right: Math.max(8, clampedRight),
            })
          }
          setIsOpen(!isOpen)
        }}
        title="Switch Canvas Session"
        disabled={!currentSessionId && sessions.length === 0}
      >
        {(!currentSession && sessions.length === 0) ? (
          <svg className="session-icon-svg session-icon-spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        ) : (
          <svg className="session-icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
        )}
        <span className={`session-name ${!currentSession ? 'session-name--loading' : ''}`}>
          {currentSession?.name || (sessions.length > 0 ? sessions[0]?.name : 'Loading')}
        </span>
        <svg className="session-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points={isOpen ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/>
        </svg>
      </button>

      {isOpen && (
        <div className="session-dropdown" ref={dropdownRef} style={{ top: dropdownPos.top, right: dropdownPos.right, width: Math.min(320, window.innerWidth - 16) }}>
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
            {sessions.map(session => {
              const isCurrentSession = session.id === currentSessionId
              const sessionCollabs = sessionCollaborators[session.id] || []
              const isSessionOwner = session.creatorId === (currentUser?.id || auth.currentUser?.uid)
              
              return (
              <div key={session.id} className="session-item-wrapper">
                <div
                  className={`session-item ${isCurrentSession ? 'active' : ''} ${switchingToSessionId === session.id ? 'loading' : ''}`}
                  onClick={() => handleSwitchSession(session.id)}
                >
                  <div className="session-item-info">
                    <span className="session-item-name">
                      {session.name}
                      {switchingToSessionId === session.id && (
                        <svg className="session-loading-spinner" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                        </svg>
                      )}
                    </span>
                    {isCurrentSession && <span className="session-badge">Current</span>}
                    {session.isPrivate && <span className="session-badge private">Private</span>}
                    {sessionCollabs.length > 0 && (
                      <span className="session-badge shared" title={`Shared with ${sessionCollabs.length} user${sessionCollabs.length > 1 ? 's' : ''}`}>
                        👥 {sessionCollabs.length}
                      </span>
                    )}
                  </div>
                  <div className="session-item-meta">
                    <span className="session-date">
                      {session.createdAt?.seconds 
                        ? new Date(session.createdAt.seconds * 1000).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })
                        : 'Just now'}
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
                      {/* Members button — visible to everyone, owners get full manage UI */}
                      <button
                        className="session-action-button"
                        onClick={(e) => handleOpenShareDialog(session.id, e)}
                        title={isSessionOwner ? 'Share with user' : 'View members'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="18" cy="5" r="3" />
                          <circle cx="6" cy="12" r="3" />
                          <circle cx="18" cy="19" r="3" />
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                      </button>
                      {isSessionOwner && (
                        <>
                          <button
                            className="session-action-button"
                            onClick={(e) => handleTogglePrivacy(session.id, session.isPrivate, e)}
                            title={session.isPrivate ? 'Make accessible to all board members' : 'Make private'}
                          >
                            {session.isPrivate ? '🔒' : '🔓'}
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
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                {shareDialogOpen === session.id && (
                  <div ref={shareDialogRef} className="session-share-dialog" onClick={(e) => e.stopPropagation()}>
                    <div className="share-dialog-header">
                      <h4>Share "{session.name}"</h4>
                      <button onClick={() => {
                        setShareDialogOpen(null)
                        setShowSuggestions(false)
                        setUserSuggestions([])
                      }}>×</button>
                    </div>
                    
                    {isSessionOwner ? (
                      <>
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
                          
                          <div className="share-actions-row">
                            <select
                              className="session-role-select"
                              value={selectedRole}
                              onChange={e => setSelectedRole(e.target.value)}
                              onClick={e => e.stopPropagation()}
                            >
                              <option value="viewer">Viewer</option>
                              <option value="commentor">Commentor</option>
                              <option value="editor">Editor</option>
                            </select>
                            
                            <button 
                              onClick={() => handleShareSession(session.id)}
                              disabled={sharingSessionId === session.id || !shareEmail.trim()}
                              className={sharingSessionId === session.id ? 'loading' : ''}
                            >
                              {sharingSessionId === session.id ? 'Sending invite...' : 'Share'}
                            </button>
                          </div>
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
                                <select
                                  className="session-role-select session-role-select--inline"
                                  value={collab.role || 'editor'}
                                  onChange={e => handleRoleChange(session.id, collab.id, e.target.value)}
                                  disabled={loading}
                                >
                                  <option value="viewer">Viewer</option>
                                  <option value="commentor">Commentor</option>
                                  <option value="editor">Editor</option>
                                </select>
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
                      </>
                    ) : (
                      // Read-only view for non-owners
                      <>
                        {loadingCollaborators ? (
                          <div className="share-loading">Loading...</div>
                        ) : collaborators.length > 0 ? (
                          <div className="collaborators-list">
                            <h5>Members:</h5>
                            {collaborators.map(collab => (
                              <div key={collab.id} className="collaborator-item">
                                <div className="collaborator-info">
                                  <span className="collaborator-name">{collab.name}</span>
                                  <span className="collaborator-email">{collab.email}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="share-empty">No other members</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )})}
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
                    setNewSessionPrivate(false)
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
              <div className="session-create-privacy">
                <label>
                  <input
                    type="checkbox"
                    checked={newSessionPrivate}
                    onChange={(e) => setNewSessionPrivate(e.target.checked)}
                  />
                  <span>Make this session private</span>
                </label>
              </div>
              <div className="session-create-actions">
                <button onClick={handleCreateSession} disabled={loading || !newSessionName.trim()}>
                  {loading ? 'Creating...' : 'Create'}
                </button>
                <button onClick={() => {
                  setIsCreating(false)
                  setNewSessionPrivate(false)
                }} className="cancel" disabled={loading}>
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