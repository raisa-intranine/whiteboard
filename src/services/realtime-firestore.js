// Firestore-based real-time service (replaces Ably)
// This provides the same interface as the old realtime.js but uses Firestore
import { doc, setDoc, onSnapshot, deleteDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore'
import { db, auth } from './firebase'

let currentBoardId = null
let currentSessionId = null
let unsubscribeSession = null
let unsubscribePresence = null
let messageCallback = null
let lastUpdateTime = 0
let isLocalUpdate = false
let myClientId = null
let isConnected = false

/**
 * Check if realtime connection is ready
 */
export const isRealtimeReady = () => {
  const ready = !!currentBoardId && !!auth.currentUser && isConnected
  console.log('[Realtime] isRealtimeReady check:', ready, 'boardId:', currentBoardId, 'user:', auth.currentUser?.uid, 'connected:', isConnected)
  return ready
}

/**
 * Initialize Firestore real-time listeners
 */
export const initRealtime = async (boardId, sessionId, onMessage) => {
  console.log('[Realtime] ========== INIT REALTIME START ==========')
  console.log('[Realtime] Initializing for board:', boardId, 'session:', sessionId)
  console.log('[Realtime] Current state before init - boardId:', currentBoardId, 'connected:', isConnected)
  
  const channelName = sessionId ? `board:${boardId}:session:${sessionId}` : `board:${boardId}`
  
  // If already connected to same session, skip
  if (currentBoardId === boardId && currentSessionId === sessionId && unsubscribeSession) {
    console.log('[Realtime] Already connected to channel:', channelName, 'isConnected:', isConnected)
    return Promise.resolve()
  }

  // Disconnect from previous session
  console.log('[Realtime] Disconnecting from previous session...')
  await disconnectRealtime()
  console.log('[Realtime] Disconnect complete, now setting new connection...')

  currentBoardId = boardId
  currentSessionId = sessionId
  messageCallback = onMessage
  myClientId = auth.currentUser?.uid
  isConnected = true
  
  console.log('[Realtime] ✓ Set isConnected = true')
  console.log('[Realtime] ✓ currentBoardId:', currentBoardId)
  console.log('[Realtime] ✓ myClientId:', myClientId)
  console.log('[Realtime] ✓ isRealtimeReady():', isRealtimeReady())

  // Subscribe to session changes for real-time canvas updates
  const sessionRef = sessionId 
    ? doc(db, 'boards', boardId, 'sessions', sessionId)
    : doc(db, 'boards', boardId)

  unsubscribeSession = onSnapshot(sessionRef, (snapshot) => {
    if (!snapshot.exists()) return
    
    const data = snapshot.data()
    
    // Ignore our own updates (within 1 second window)
    if (isLocalUpdate && Date.now() - lastUpdateTime < 1000) {
      console.log('[Realtime] Ignoring own update')
      isLocalUpdate = false
      return
    }
    
    // Notify callback with canvas data
    if (messageCallback && data.canvasJson) {
      // Parse canvasJson if it's stored as a string
      const canvasJson = typeof data.canvasJson === 'string' 
        ? JSON.parse(data.canvasJson) 
        : data.canvasJson
      messageCallback({
        type: 'canvas:full',
        canvasJson,
        background: data.background
      })
    }
  })

  console.log('[Realtime] Connected with clientId:', myClientId, 'to board:', boardId, 'session:', sessionId || '(none)')
  console.log('[Realtime] Channel name:', channelName)
  console.log('[Realtime] isRealtimeReady() should now return:', isRealtimeReady())
  console.log('[Realtime] ========== INIT REALTIME COMPLETE ==========')
  
  return Promise.resolve()
}

/**
 * Publish full canvas state to all collaborators
 */
export const publishFullCanvas = async (data) => {
  if (!currentBoardId) {
    console.warn('[Realtime] Cannot publish - no active channel')
    return
  }
  
  console.log('[Realtime] Publishing full canvas')
  
  try {
    isLocalUpdate = true
    lastUpdateTime = Date.now()
    
    const sessionRef = currentSessionId 
      ? doc(db, 'boards', currentBoardId, 'sessions', currentSessionId)
      : doc(db, 'boards', currentBoardId)
    
    // Store canvasJson as string to avoid Firestore nested arrays limitation
    await setDoc(sessionRef, {
      canvasJson: JSON.stringify(data.canvasJson),
      background: data.background,
      updatedAt: serverTimestamp()
    }, { merge: true })
    
    console.log('[Realtime] Canvas published successfully')
  } catch (err) {
    console.error('[Realtime] Failed to publish canvas:', err.message)
    isLocalUpdate = false
  }
}

/**
 * Request a canvas sync from other collaborators
 */
export const requestSync = () => {
  console.log('[Realtime] Sync request not needed with Firestore - data syncs automatically')
}

/**
 * Publish a canvas:clear event
 */
export const publishClear = async (data) => {
  if (!currentBoardId) {
    console.warn('[Realtime] Cannot publish clear - no active channel')
    return
  }
  
  console.log('[Realtime] Publishing clear canvas')
  
  try {
    isLocalUpdate = true
    lastUpdateTime = Date.now()
    
    const sessionRef = currentSessionId 
      ? doc(db, 'boards', currentBoardId, 'sessions', currentSessionId)
      : doc(db, 'boards', currentBoardId)
    
    // Store canvasJson as string to avoid Firestore nested arrays limitation
    await setDoc(sessionRef, {
      canvasJson: JSON.stringify({ objects: [], version: '5.3.0' }),
      background: data.background,
      updatedAt: serverTimestamp()
    }, { merge: true })
  } catch (err) {
    console.error('[Realtime] Failed to publish clear:', err)
    isLocalUpdate = false
  }
}

/**
 * Get the current client ID
 */
export const getClientId = () => {
  return myClientId || auth.currentUser?.uid || null
}

/**
 * Enter presence with user info (session-specific)
 */
export const enterPresence = async (userData) => {
  if (!currentBoardId || !currentSessionId || !auth.currentUser) {
    console.warn('[Realtime] Cannot enter presence - no board, session, or user')
    return
  }
  
  try {
    // Store presence at session level, not board level
    const presenceRef = doc(db, 'boards', currentBoardId, 'sessions', currentSessionId, 'presence', auth.currentUser.uid)
    await setDoc(presenceRef, {
      ...userData,
      userId: auth.currentUser.uid,
      sessionId: currentSessionId,
      lastSeen: serverTimestamp()
    })
    console.log('[Realtime] Entered presence for session:', currentSessionId, 'user:', userData.name)
  } catch (err) {
    console.error('[Realtime] Failed to enter presence:', err)
  }
}

/**
 * Update presence state (session-specific)
 */
export const updatePresence = async (userData) => {
  if (!currentBoardId || !currentSessionId || !auth.currentUser) {
    console.warn('[Realtime] Cannot update presence - no board, session, or user')
    return
  }
  
  console.log('[Realtime] Updating presence for session:', currentSessionId, 'user:', userData.name, 'isEditing:', userData.isEditing)
  console.log('[Realtime] Full userData being saved:', JSON.stringify(userData))
  
  try {
    // Store presence at session level, not board level
    const presenceRef = doc(db, 'boards', currentBoardId, 'sessions', currentSessionId, 'presence', auth.currentUser.uid)
    const dataToSave = {
      ...userData,
      userId: auth.currentUser.uid,
      sessionId: currentSessionId,
      lastSeen: serverTimestamp()
    }
    console.log('[Realtime] Saving to Firestore:', JSON.stringify(dataToSave, null, 2))
    await setDoc(presenceRef, dataToSave, { merge: true })
    console.log('[Realtime] Presence update successful')
  } catch (err) {
    console.error('[Realtime] Failed to update presence:', err)
  }
}

/**
 * Subscribe to presence changes (session-specific)
 */
export const onPresenceChange = (callback) => {
  if (!currentBoardId || !currentSessionId) {
    console.warn('[Realtime] Cannot subscribe to presence - no active board or session')
    return () => {}
  }
  
  // Subscribe to session-specific presence
  const presenceRef = collection(db, 'boards', currentBoardId, 'sessions', currentSessionId, 'presence')
  
  let isFirstSnapshot = true
  const unsubscribe = onSnapshot(presenceRef, (snapshot) => {
    console.log('[Realtime] onPresenceChange snapshot received for session:', currentSessionId, 'isFirst:', isFirstSnapshot, 'docs:', snapshot.docs.length)
    
    if (isFirstSnapshot) {
      // On first snapshot, emit 'enter' for all existing members
      snapshot.docs.forEach((doc) => {
        const member = {
          clientId: doc.id,
          data: doc.data()
        }
        console.log('[Realtime] First snapshot - emitting enter for:', member.data?.name, 'isEditing:', member.data?.isEditing)
        callback('enter', member)
      })
      isFirstSnapshot = false
    } else {
      // On subsequent snapshots, only emit changes
      console.log('[Realtime] Subsequent snapshot - changes:', snapshot.docChanges().length)
      snapshot.docChanges().forEach((change) => {
        const member = {
          clientId: change.doc.id,
          data: change.doc.data()
        }
        
        console.log('[Realtime] Change type:', change.type, 'member:', member.data?.name, 'isEditing:', member.data?.isEditing)
        
        if (change.type === 'added') {
          callback('enter', member)
        } else if (change.type === 'modified') {
          callback('update', member)
        } else if (change.type === 'removed') {
          callback('leave', member)
        }
      })
    }
  })
  
  return unsubscribe
}

/**
 * Check if realtime is connected
 */
export const isRealtimeConnected = () => {
  return !!currentBoardId && !!auth.currentUser
}

/**
 * Get all current presence members (session-specific)
 */
export const getPresenceMembers = async () => {
  if (!currentBoardId || !currentSessionId) {
    console.log('[Realtime] getPresenceMembers - no currentBoardId or currentSessionId')
    return []
  }
  
  try {
    // Get presence from session-specific collection
    const presenceRef = collection(db, 'boards', currentBoardId, 'sessions', currentSessionId, 'presence')
    const snapshot = await getDocs(presenceRef)
    
    const members = snapshot.docs.map(doc => {
      const data = doc.data()
      console.log('[Realtime] getPresenceMembers - doc:', doc.id, 'isEditing:', data.isEditing, 'full data:', data)
      return {
        clientId: doc.id,
        data: data
      }
    })
    
    console.log('[Realtime] getPresenceMembers found:', members.length, 'members for session:', currentSessionId)
    return members
  } catch (err) {
    console.error('[Realtime] Failed to get presence members:', err)
    return []
  }
}

/**
 * Subscribe to cursor movement events (not implemented yet)
 */
export const onCursorMove = (callback) => {
  console.log('[Realtime] Cursor tracking not yet implemented with Firestore')
  return () => {}
}

/**
 * Publish cursor position (not implemented yet)
 */
export const publishCursorMove = (position) => {
  // Not implemented - can add later if needed
}

// Viewport sync implementation
let lastViewportPublish = 0
let viewportSyncEnabled = true
let lastReceivedViewport = 0

/**
 * Publish viewport position to sync with other users (session-specific)
 */
export const publishViewportSync = async (viewport) => {
  if (!currentBoardId || !currentSessionId || !auth.currentUser) return
  
  // Throttle viewport updates to avoid excessive writes
  const now = Date.now()
  if (now - lastViewportPublish < 100) return
  lastViewportPublish = now
  
  try {
    // Store viewport in session-specific presence
    const presenceRef = doc(db, 'boards', currentBoardId, 'sessions', currentSessionId, 'presence', auth.currentUser.uid)
    await setDoc(presenceRef, {
      viewport,
      lastSeen: serverTimestamp()
    }, { merge: true })
  } catch (err) {
    console.warn('[Realtime] Failed to publish viewport:', err)
  }
}

/**
 * Subscribe to viewport sync events from other users (session-specific)
 */
export const onViewportSync = (callback) => {
  if (!currentBoardId || !currentSessionId) return () => {}
  
  // Subscribe to session-specific presence
  const presenceRef = collection(db, 'boards', currentBoardId, 'sessions', currentSessionId, 'presence')
  
  const unsubscribe = onSnapshot(presenceRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      // Only listen to viewport updates from other users
      if (change.doc.id !== auth.currentUser?.uid) {
        const data = change.doc.data()
        if (data.viewport && viewportSyncEnabled) {
          // Throttle incoming viewport updates to prevent jitter
          const now = Date.now()
          if (now - lastReceivedViewport > 150) {
            lastReceivedViewport = now
            callback(data.viewport)
          }
        }
      }
    })
  })
  
  return unsubscribe
}

/**
 * Temporarily disable viewport sync (used during sync application to prevent echo)
 */
export const setViewportSyncEnabled = (enabled) => {
  viewportSyncEnabled = enabled
}

/**
 * Publish selected object ID(s) to presence (so other users can see what you've selected)
 */
export const publishSelection = async (selectedObjectId) => {
  if (!currentBoardId || !currentSessionId || !auth.currentUser) return
  try {
    const presenceRef = doc(db, 'boards', currentBoardId, 'sessions', currentSessionId, 'presence', auth.currentUser.uid)
    // selectedObjectId can be a string (single), array (multi), or null
    await setDoc(presenceRef, {
      selectedObjectId: selectedObjectId || null,
      lastSeen: serverTimestamp()
    }, { merge: true })
  } catch (err) {
    console.warn('[Realtime] Failed to publish selection:', err)
  }
}

/**
 * Disconnect and clean up (session-specific presence)
 */
export const disconnectRealtime = async () => {
  console.log('[Realtime] ========== DISCONNECT REALTIME START ==========')
  console.log('[Realtime] disconnectRealtime() called')
  console.log('[Realtime] Current state - boardId:', currentBoardId, 'sessionId:', currentSessionId, 'connected:', isConnected)
  console.trace('[Realtime] Disconnect called from:')
  
  // Leave presence (session-specific)
  if (currentBoardId && currentSessionId && auth.currentUser) {
    try {
      const presenceRef = doc(db, 'boards', currentBoardId, 'sessions', currentSessionId, 'presence', auth.currentUser.uid)
      await deleteDoc(presenceRef)
      console.log('[Realtime] Left presence successfully for session:', currentSessionId)
    } catch (err) {
      console.warn('[Realtime] Failed to leave presence:', err)
    }
  }
  
  // Unsubscribe from listeners
  if (unsubscribeSession) {
    unsubscribeSession()
    unsubscribeSession = null
  }
  
  if (unsubscribePresence) {
    unsubscribePresence()
    unsubscribePresence = null
  }
  
  currentBoardId = null
  currentSessionId = null
  messageCallback = null
  myClientId = null
  isConnected = false
  
  console.log('[Realtime] Disconnect complete - all state cleared')
  console.log('[Realtime] ========== DISCONNECT REALTIME END ==========')
}
