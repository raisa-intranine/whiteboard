import { useState, useEffect, useRef } from 'react'
import { searchUsers, shareBoard, getCollaborators, removeCollaborator } from '../services/api'
import './ShareModal.css'

const getInitials = (name) =>
  name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

const AVATAR_COLORS = [
  ['#667eea', '#764ba2'], ['#f093fb', '#f5576c'], ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'], ['#fa709a', '#fee140'], ['#a18cd1', '#fbc2eb'],
  ['#fccb90', '#d57eeb'], ['#a1c4fd', '#c2e9fb'],
]

const getAvatarColor = (email) => {
  const idx = Array.from(email).reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

const ShareModal = ({ visible, onClose, boardId, theme }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [collaborators, setCollaborators] = useState([])
  const [owner, setOwner] = useState(null)
  const [isPublic, setIsPublic] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [removingUserId, setRemovingUserId] = useState(null)
  const [notification, setNotification] = useState(null)
  const searchTimeoutRef = useRef(null)

  useEffect(() => {
    if (visible && boardId) {
      loadCollaborators()
    }
  }, [visible, boardId])

  useEffect(() => {
    if (!visible) {
      setSearchQuery('')
      setSearchResults([])
      setCopied(false)
    }
  }, [visible])

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      return
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const { users } = await searchUsers(searchQuery)
        // Filter out users who are already collaborators
        const collabIds = new Set([owner?.id, ...collaborators.map(c => c.id)])
        setSearchResults(users.filter(u => !collabIds.has(u.id)))
      } catch (err) {
        console.error('Search failed:', err)
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, collaborators, owner])

  const loadCollaborators = async () => {
    try {
      const data = await getCollaborators(boardId)
      setOwner(data.owner)
      setCollaborators(data.collaborators)
      setIsPublic(data.isPublic)
    } catch (err) {
      console.error('Failed to load collaborators:', err)
    }
  }

  const handleAddCollaborator = async (user) => {
    setLoading(true)
    try {
      await shareBoard(boardId, user.email)
      await loadCollaborators()
      setSearchQuery('')
      setSearchResults([])
      
      // Show success notification
      setNotification({
        type: 'success',
        message: `${user.name} has been added. They can now access this board.`
      })
      setTimeout(() => setNotification(null), 4000)
    } catch (err) {
      console.error('Failed to add collaborator:', err)
      setNotification({
        type: 'error',
        message: 'Failed to add collaborator. Please try again.'
      })
      setTimeout(() => setNotification(null), 4000)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveCollaborator = async (userId) => {
    setRemovingUserId(userId)
  }

  const handleCopyLink = async () => {
    const boardUrl = `${window.location.origin}${window.location.pathname}?board=${boardId}`
    
    // Make board public if not already
    if (!isPublic) {
      setLoading(true)
      try {
        await shareBoard(boardId)
        setIsPublic(true)
      } catch (err) {
        console.error('Failed to make board public:', err)
        alert('Failed to generate share link')
        setLoading(false)
        return
      } finally {
        setLoading(false)
      }
    }

    try {
      await navigator.clipboard.writeText(boardUrl)
    } catch {
      const el = document.createElement('textarea')
      el.value = boardUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const confirmRemove = async () => {
    if (!removingUserId) return
    
    setLoading(true)
    try {
      await removeCollaborator(boardId, removingUserId)
      await loadCollaborators()
      setNotification({
        type: 'success',
        message: 'Collaborator removed successfully'
      })
      setTimeout(() => setNotification(null), 3000)
    } catch (err) {
      console.error('Failed to remove collaborator:', err)
      setNotification({
        type: 'error',
        message: 'Failed to remove collaborator'
      })
      setTimeout(() => setNotification(null), 3000)
    } finally {
      setLoading(false)
      setRemovingUserId(null)
    }
  }

  if (!visible) return null

  return (
    <>
      <div className="share-modal-backdrop" onClick={onClose}>
        <div className={`share-modal ${theme}`} onClick={e => e.stopPropagation()}>
        <div className="share-modal-header">
          <h2>Share Board</h2>
          <button className="share-modal-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="share-modal-body">
          {/* Search for users */}
          <div className="share-section">
            <label className="share-label">Add people</label>
            <div className="share-search-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search by email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.stopPropagation()}
                disabled={loading}
              />
            </div>

            {searching && (
              <div className="share-search-loading">Searching...</div>
            )}

            {searchResults.length > 0 && (
              <div className="share-search-results">
                {searchResults.map(user => {
                  const [grad1, grad2] = getAvatarColor(user.email)
                  return (
                    <button
                      key={user.id}
                      className="share-user-result"
                      onClick={() => handleAddCollaborator(user)}
                      disabled={loading}
                    >
                      <div className="share-user-avatar" style={{ background: `linear-gradient(135deg, ${grad1}, ${grad2})` }}>
                        {getInitials(user.name)}
                      </div>
                      <div className="share-user-info">
                        <div className="share-user-name">{user.name}</div>
                        <div className="share-user-email">{user.email}</div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  )
                })}
              </div>
            )}

            {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
              <div className="share-no-results">No users found</div>
            )}
          </div>

          {/* Current collaborators */}
          <div className="share-section">
            <label className="share-label">People with access</label>
            <div className="share-collaborators-list">
              {/* Owner */}
              {owner && (
                <div className="share-collaborator">
                  <div className="share-user-avatar" style={{ background: `linear-gradient(135deg, ${getAvatarColor(owner.email)[0]}, ${getAvatarColor(owner.email)[1]})` }}>
                    {getInitials(owner.name)}
                  </div>
                  <div className="share-user-info">
                    <div className="share-user-name">{owner.name}</div>
                    <div className="share-user-email">{owner.email}</div>
                  </div>
                  <div className="share-user-role">Owner</div>
                </div>
              )}

              {/* Collaborators */}
              {collaborators.map(collab => {
                const [grad1, grad2] = getAvatarColor(collab.email)
                return (
                  <div key={collab.id} className="share-collaborator">
                    <div className="share-user-avatar" style={{ background: `linear-gradient(135deg, ${grad1}, ${grad2})` }}>
                      {getInitials(collab.name)}
                    </div>
                    <div className="share-user-info">
                      <div className="share-user-name">{collab.name}</div>
                      <div className="share-user-email">{collab.email}</div>
                    </div>
                    <button
                      className="share-remove-btn"
                      onClick={() => handleRemoveCollaborator(collab.id)}
                      disabled={loading}
                      title="Remove access"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )
              })}

              {collaborators.length === 0 && (
                <div className="share-no-collaborators">
                  No collaborators yet. Search for users above to add them.
                </div>
              )}
            </div>
          </div>

          {/* Public link */}
          <div className="share-section">
            <label className="share-label">Share link</label>
            <p className="share-description">
              Anyone with this link can view and edit this board
            </p>
            <button
              className={`share-copy-link-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopyLink}
              disabled={loading}
            >
              {copied ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Link copied!
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  Copy link
                </>
              )}
            </button>
          </div>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div className={`share-notification ${notification.type}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {notification.type === 'success' ? (
                <polyline points="20 6 9 17 4 12" />
              ) : (
                <>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </>
              )}
            </svg>
            {notification.message}
          </div>
        )}
        </div>
      </div>

      {/* Remove Confirmation Dialog */}
      {removingUserId && (
        <div className="share-confirm-backdrop" onClick={() => setRemovingUserId(null)}>
          <div className={`share-confirm-dialog ${theme}`} onClick={e => e.stopPropagation()}>
            <div className="share-confirm-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <h3>Remove this collaborator?</h3>
            </div>
            <p className="share-confirm-message">
              They will no longer be able to access this board.
            </p>
            <div className="share-confirm-actions">
              <button 
                className="share-confirm-btn cancel"
                onClick={() => setRemovingUserId(null)}
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                className="share-confirm-btn remove"
                onClick={confirmRemove}
                disabled={loading}
              >
                {loading ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ShareModal