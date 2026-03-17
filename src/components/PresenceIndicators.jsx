import { useState, useEffect, useRef, useCallback } from 'react'
import { onPresenceChange, onCursorMove, getClientId, getPresenceMembers, isRealtimeReady } from '../services/realtime-firestore'
import { auth } from '../services/firebase'
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

const PresenceIndicators = ({ containerRef, fabricRef }) => {
  const [presenceMembers, setPresenceMembers] = useState([])
  const [remoteCursors, setRemoteCursors] = useState({})
  const [remoteSelections, setRemoteSelections] = useState({})
  const overlayCanvasRef = useRef(null)
  const animFrameRef = useRef(null)
  // Keep a ref so the draw loop always has the latest selections
  const remoteSelectionsRef = useRef({})

  // Keep ref in sync
  useEffect(() => {
    remoteSelectionsRef.current = remoteSelections
  }, [remoteSelections])

  // Draw selection highlights on the HTML canvas overlay
  const drawOverlay = useCallback(() => {
    const canvas = fabricRef?.current
    const overlayCanvas = overlayCanvasRef.current
    if (!canvas || !overlayCanvas || !canvas.lowerCanvasEl) return

    const ctx = overlayCanvas.getContext('2d')
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)

    const selections = remoteSelectionsRef.current
    if (Object.keys(selections).length === 0) return

    const vpt = canvas.viewportTransform // [scaleX, 0, 0, scaleY, panX, panY]

    Object.entries(selections).forEach(([, sel]) => {
      if (!sel.objectId) return
      // objectId can be a string (single) or array (multi-selection)
      const ids = Array.isArray(sel.objectId) ? sel.objectId : [sel.objectId]
      const targets = canvas.getObjects().filter(o => o.id && ids.includes(o.id))
      if (targets.length === 0) return

      const [color] = getAvatarColor(sel.email)

      // Compute combined bounding rect for all selected objects
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      targets.forEach(target => {
        const br = target.getBoundingRect(true, true)
        minX = Math.min(minX, br.left)
        minY = Math.min(minY, br.top)
        maxX = Math.max(maxX, br.left + br.width)
        maxY = Math.max(maxY, br.top + br.height)
      })

      const x = minX * vpt[0] + vpt[4]
      const y = minY * vpt[3] + vpt[5]
      const w = (maxX - minX) * vpt[0]
      const h = (maxY - minY) * vpt[3]

      // Dashed selection border
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.strokeRect(x, y, w, h)
      ctx.restore()

      // Name label background
      const name = sel.name || 'User'
      ctx.save()
      ctx.font = '600 11px "DM Sans", sans-serif'
      const textW = ctx.measureText(name).width
      const labelW = textW + 12
      const labelH = 20
      const labelX = x
      const labelY = y - labelH - 2

      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(labelX, labelY, labelW, labelH, 4)
      ctx.fill()

      // Name text
      ctx.fillStyle = '#ffffff'
      ctx.fillText(name, labelX + 6, labelY + 14)
      ctx.restore()
    })
  }, [fabricRef])

  // Sync overlay canvas size to the Fabric canvas size
  const syncSize = useCallback(() => {
    const canvas = fabricRef?.current
    const overlayCanvas = overlayCanvasRef.current
    if (!canvas || !overlayCanvas || !canvas.lowerCanvasEl) return
    const el = canvas.lowerCanvasEl
    if (overlayCanvas.width !== el.offsetWidth || overlayCanvas.height !== el.offsetHeight) {
      overlayCanvas.width = el.offsetWidth
      overlayCanvas.height = el.offsetHeight
    }
  }, [fabricRef])

  // Continuous render loop — redraws every animation frame so it tracks zoom/pan instantly
  useEffect(() => {
    let running = true
    const loop = () => {
      if (!running) return
      syncSize()
      drawOverlay()
      animFrameRef.current = requestAnimationFrame(loop)
    }
    animFrameRef.current = requestAnimationFrame(loop)
    return () => {
      running = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [drawOverlay, syncSize])

  useEffect(() => {
    const getMyId = () => auth.currentUser?.uid || getClientId()

    const isMe = (member) => {
      const myId = getMyId()
      return myId && (member.clientId === myId || member.data?.userId === myId)
    }

    const filterMembers = (members) => {
      const now = Date.now()
      return members.filter(m => {
        if (isMe(m)) return false
        const lastSeen = m.data?.lastSeen?.toMillis?.() || (m.data?.lastSeen?.seconds && m.data.lastSeen.seconds * 1000)
        if (lastSeen && now - lastSeen > 120000) return false
        return true
      })
    }

    const extractSelections = (members) => {
      const selections = {}
      members.forEach(m => {
        if (m.data?.selectedObjectId) {
          selections[m.clientId] = {
            objectId: m.data.selectedObjectId,
            name: m.data.name,
            email: m.data.email,
          }
        }
      })
      return selections
    }

    const fetchMembers = async () => {
      if (!isRealtimeReady()) return
      const members = await getPresenceMembers()
      const filtered = filterMembers(members)
      setPresenceMembers(filtered)
      setRemoteSelections(extractSelections(filtered))
    }

    fetchMembers()
    setTimeout(fetchMembers, 1000)
    setTimeout(fetchMembers, 3000)

    const applyMember = (event, member) => {
      if (isMe(member)) return

      if (event === 'enter' || event === 'update') {
        const lastSeen = member.data?.lastSeen?.toMillis?.() || (member.data?.lastSeen?.seconds && member.data.lastSeen.seconds * 1000)
        if (lastSeen && Date.now() - lastSeen > 120000) return

        setPresenceMembers(prev => {
          const filtered = prev.filter(m => m.clientId !== member.clientId)
          return [...filtered, member]
        })

        setRemoteSelections(prev => {
          const next = { ...prev }
          if (member.data?.selectedObjectId) {
            next[member.clientId] = {
              objectId: member.data.selectedObjectId,
              name: member.data.name,
              email: member.data.email,
            }
          } else {
            delete next[member.clientId]
          }
          return next
        })
      } else if (event === 'leave') {
        setPresenceMembers(prev => prev.filter(m => m.clientId !== member.clientId))
        setRemoteCursors(prev => { const n = { ...prev }; delete n[member.clientId]; return n })
        setRemoteSelections(prev => { const n = { ...prev }; delete n[member.clientId]; return n })
      }
    }

    const unsubscribePresence = onPresenceChange(applyMember)

    const unsubscribeCursor = onCursorMove((clientId, data) => {
      if (clientId === getMyId()) return
      setRemoteCursors(prev => ({ ...prev, [clientId]: { ...data, lastUpdate: Date.now() } }))
    })

    const presenceRefreshInterval = setInterval(async () => {
      if (!isRealtimeReady()) return
      const members = await getPresenceMembers()
      const filtered = filterMembers(members)
      setPresenceMembers(filtered)
      setRemoteSelections(extractSelections(filtered))
    }, 5000)

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

  return (
    <>
      {/* Transparent overlay canvas for drawing remote selections */}
      <canvas
        ref={overlayCanvasRef}
        className="remote-selection-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 50,
        }}
      />

      <div className="presence-indicators">
        {editingMembers.length > 0 && (
          <div className="presence-editing-indicator">
            <span className="presence-editing-dot" />
            {editingMembers.length === 1
              ? `${editingMembers[0].data?.name || 'Someone'} is editing`
              : `${editingMembers.length} people are editing`}
          </div>
        )}

        {presenceMembers.length > 0 && (
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
                    {isEditing && ' · editing'}
                  </div>
                </div>
              )
            })}
            {presenceMembers.length > 5 && (
              <div className="presence-avatar" style={{ background: '#6b7280' }}>
                +{presenceMembers.length - 5}
                <div className="presence-tooltip">{presenceMembers.length - 5} more</div>
              </div>
            )}
          </div>
        )}
      </div>

      {Object.entries(remoteCursors).map(([clientId, cursor]) => {
        const member = presenceMembers.find(m => m.clientId === clientId)
        if (!member || !cursor.x || !cursor.y) return null
        const [grad1] = getAvatarColor(member.data?.email)
        return (
          <div
            key={clientId}
            className="remote-cursor"
            style={{ left: `${cursor.x}px`, top: `${cursor.y}px`, color: grad1 }}
          >
            <div className="remote-cursor-pointer" />
            <div className="remote-cursor-label">{member.data?.name || 'Anonymous'}</div>
          </div>
        )
      })}
    </>
  )
}

export default PresenceIndicators
