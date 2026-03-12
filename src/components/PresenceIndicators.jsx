import { useState, useEffect } from 'react'
import { onPresenceChange, onCursorMove, getClientId, getPresenceMembers, isRealtimeReady } from '../services/realtime'
import './PresenceIndicators.css'

const getInitials = (name) =>
  name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'

const AVATAR_COLORS = [
  ['#667eea', '#764ba2'], ['#f093fb', '#f5576c'], ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'], ['#fa709a', '#fee140'], ['#a18cd1', '#fbc2eb'],
  ['#fccb90', '#d57eeb'], ['#a1c4fd', '#c2e9fb'],
]

const getAvatarColor = (email) => {
  const idx = Array.from(email || '').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

const PresenceIndicators = ({ containerRef }) => {
  const [presenceMembers, setPresenceMembers] = useState([])
  const [remoteCursors, setRemoteCursors] = useState({})

  useEffect(() => {
    // Fetch initial presence members immediately
    const fetchInitialMembers = async () => {
      // Wait for realtime connection to be ready
      if (!isRealtimeReady()) {
        console.log('[PresenceIndicators] Realtime not ready yet, skipping fetch')
        return
      }
      
      console.log('[PresenceIndicators] Fetching initial presence members...')
      const members = await getPresenceMembers()
      const myClientId = getClientId()
      console.log('[PresenceIndicators] Found', members.length, 'total members, myClientId:', myClientId)
      
      // Log all members before filtering
      members.forEach(m => {
        console.log('[PresenceIndicators] Member:', m.clientId, 'name:', m.data?.name, 'email:', m.data?.email, 'isMe:', m.clientId === myClientId)
      })
      
      const others = members.filter(m => m.clientId !== myClientId)
      console.log('[PresenceIndicators] After filtering self:', others.length, 'other members')
      setPresenceMembers(others)
    }
    
    // Fetch immediately and retry after delays to wait for connection
    fetchInitialMembers()
    setTimeout(fetchInitialMembers, 1000)
    setTimeout(fetchInitialMembers, 3000)
    
    const applyMember = (event, member) => {
      const myClientId = getClientId()
      console.log('[PresenceIndicators] Presence event:', event, 'member:', member.clientId, 'name:', member.data?.name)
      if (event === 'enter' || event === 'update') {
        setPresenceMembers(prev => {
          const filtered = prev.filter(m => m.clientId !== member.clientId)
          if (member.clientId === myClientId) {
            console.log('[PresenceIndicators] Ignoring self (enter/update)')
            return filtered
          }
          console.log('[PresenceIndicators] Adding/updating member:', member.data?.name)
          return [...filtered, member]
        })
      } else if (event === 'leave') {
        console.log('[PresenceIndicators] Member left:', member.data?.name)
        setPresenceMembers(prev => prev.filter(m => m.clientId !== member.clientId))
        setRemoteCursors(prev => {
          const next = { ...prev }
          delete next[member.clientId]
          return next
        })
      }
    }

    const unsubscribePresence = onPresenceChange(applyMember)

    const unsubscribeCursor = onCursorMove((clientId, data) => {
      if (clientId === getClientId()) return
      setRemoteCursors(prev => ({
        ...prev,
        [clientId]: { ...data, lastUpdate: Date.now() }
      }))
    })

    // Periodically refresh presence list to catch any members that were missed
    const presenceRefreshInterval = setInterval(async () => {
      // Skip if realtime not ready
      if (!isRealtimeReady()) {
        console.log('[PresenceIndicators] Periodic refresh skipped - realtime not ready')
        return
      }
      
      const members = await getPresenceMembers()
      const myClientId = getClientId()
      console.log('[PresenceIndicators] Periodic refresh: found', members.length, 'total members, myClientId:', myClientId)
      
      // Log all members
      members.forEach(m => {
        console.log('[PresenceIndicators] Refresh member:', m.clientId, 'name:', m.data?.name, 'isMe:', m.clientId === myClientId)
      })
      
      const others = members.filter(m => m.clientId !== myClientId)
      console.log('[PresenceIndicators] After filtering:', others.length, 'other members')
      setPresenceMembers(others)
    }, 5000)

    // Clean up stale cursors
    const cleanupInterval = setInterval(() => {
      const now = Date.now()
      setRemoteCursors(prev => {
        const next = {}
        Object.entries(prev).forEach(([id, cursor]) => {
          if (now - cursor.lastUpdate < 5000) next[id] = cursor
        })
        return next
      })
    }, 5000)

    return () => {
      unsubscribePresence()
      unsubscribeCursor()
      clearInterval(presenceRefreshInterval)
      clearInterval(cleanupInterval)
    }
  }, [])

  const editingMembers = presenceMembers.filter(m => m.data?.isEditing)

  // Debug: log the state every render
  useEffect(() => {
    if (presenceMembers.length > 0 || editingMembers.length > 0) {
      console.log('[PresenceIndicators] Rendering:', {
        totalMembers: presenceMembers.length,
        editingMembers: editingMembers.length,
        members: presenceMembers.map(m => ({ 
          clientId: m.clientId, 
          name: m.data?.name, 
          isEditing: m.data?.isEditing 
        }))
      })
    } else {
      console.log('[PresenceIndicators] Rendering with 0 members (you might be alone or same account in both tabs)')
    }
  })

  // Always render the container so we can verify it's mounted
  // Show a debug indicator if no members to help troubleshoot
  const showDebug = process.env.NODE_ENV === 'development' && presenceMembers.length === 0

  return (
    <>
      <div className="presence-indicators">
        {showDebug && (
          <div style={{
            background: '#3b82f6',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: '8px',
            fontSize: '11px',
            opacity: 0.8
          }}>
            Presence: Active (0 collaborators)
          </div>
        )}
        {editingMembers.length > 0 && (
          <div className="presence-editing-indicator">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
            </svg>
            {editingMembers.length === 1
              ? `${editingMembers[0].data?.name || 'Someone'} is editing`
              : `${editingMembers.length} people are editing`}
          </div>
        )}

        <div className="presence-avatars">
          {presenceMembers.slice(0, 5).map(member => {
            const [grad1, grad2] = getAvatarColor(member.data?.email)
            const isEditing = member.data?.isEditing
            
            return (
              <div
                key={member.clientId}
                className={`presence-avatar ${isEditing ? 'editing' : ''}`}
                style={{ background: `linear-gradient(135deg, ${grad1}, ${grad2})` }}
              >
                {getInitials(member.data?.name)}
                <div className="presence-tooltip">
                  {member.data?.name || 'Anonymous'}
                  {isEditing && ' (editing)'}
                </div>
              </div>
            )
          })}
          
          {presenceMembers.length > 5 && (
            <div
              className="presence-avatar"
              style={{ background: '#6b7280' }}
            >
              +{presenceMembers.length - 5}
              <div className="presence-tooltip">
                {presenceMembers.length - 5} more
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Remote cursors */}
      {Object.entries(remoteCursors).map(([clientId, cursor]) => {
        const member = presenceMembers.find(m => m.clientId === clientId)
        if (!member || !cursor.x || !cursor.y) return null

        const [grad1] = getAvatarColor(member.data?.email)

        return (
          <div
            key={clientId}
            className="remote-cursor"
            style={{
              left: `${cursor.x}px`,
              top: `${cursor.y}px`,
              color: grad1,
            }}
          >
            <div className="remote-cursor-pointer" />
            <div className="remote-cursor-label">
              {member.data?.name || 'Anonymous'}
            </div>
          </div>
        )
      })}
    </>
  )
}

export default PresenceIndicators
