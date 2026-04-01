// Firestore database operations
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  Timestamp
} from 'firebase/firestore'
import { db, auth } from './firebase'

// ── Board Operations ──────────────────────────────────────────────────────────

/**
 * Create a new board
 */
export const createBoard = async (title = 'Untitled Board') => {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')

  const boardRef = doc(collection(db, 'boards'))
  const emptyCanvas = { objects: [], version: '5.3.0' }
  const boardData = {
    id: boardRef.id,
    title,
    ownerId: user.uid,
    ownerEmail: user.email,
    ownerName: user.displayName || user.email,
    collaborators: [],
    isPublic: false,
    canvasJson: JSON.stringify(emptyCanvas), // Store as string to avoid nested arrays
    background: '#ffffff',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }

  await setDoc(boardRef, boardData)
  // Return with parsed canvasJson for immediate use
  return { ...boardData, canvasJson: emptyCanvas, id: boardRef.id }
}

/**
 * Get a board by ID
 */
export const getBoard = async (boardId) => {
  const boardRef = doc(db, 'boards', boardId)
  const boardSnap = await getDoc(boardRef)
  
  if (!boardSnap.exists()) {
    throw new Error('Board not found')
  }
  
  const data = boardSnap.data()
  
  // Parse canvasJson if it's a string (stored as JSON string to avoid nested arrays)
  if (data.canvasJson && typeof data.canvasJson === 'string') {
    data.canvasJson = JSON.parse(data.canvasJson)
  }
  
  return { id: boardSnap.id, ...data }
}

/**
 * Get all boards for current user (owned or collaborated)
 */
export const getUserBoards = async () => {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')

  const boardsRef = collection(db, 'boards')
  
  // Get boards where user is owner
  const ownedQuery = query(boardsRef, where('ownerId', '==', user.uid))
  const ownedSnap = await getDocs(ownedQuery)
  
  // Get boards where user is collaborator
  const collabQuery = query(boardsRef, where('collaborators', 'array-contains', user.uid))
  const collabSnap = await getDocs(collabQuery)
  
  const boards = []
  ownedSnap.forEach(doc => boards.push({ id: doc.id, ...doc.data() }))
  collabSnap.forEach(doc => boards.push({ id: doc.id, ...doc.data() }))
  
  return boards
}

/**
 * Update board canvas and background
 */
export const updateBoard = async (boardId, { canvasJson, background }) => {
  const boardRef = doc(db, 'boards', boardId)
  const updates = { updatedAt: serverTimestamp() }
  
  // Store canvasJson as string to avoid Firestore nested arrays limitation
  if (canvasJson !== undefined) updates.canvasJson = JSON.stringify(canvasJson)
  if (background !== undefined) updates.background = background
  
  await updateDoc(boardRef, updates)
}

/**
 * Delete a board
 */
export const deleteBoard = async (boardId) => {
  await deleteDoc(doc(db, 'boards', boardId))
}

// ── Collaboration Operations ──────────────────────────────────────────────────

/**
 * Add a collaborator to a board
 */
export const addCollaborator = async (boardId, email) => {
  // Search for user by email (you'll need to maintain a users collection)
  const usersRef = collection(db, 'users')
  const q = query(usersRef, where('email', '==', email), limit(1))
  const userSnap = await getDocs(q)
  
  if (userSnap.empty) {
    throw new Error('User not found')
  }
  
  const userId = userSnap.docs[0].id
  const boardRef = doc(db, 'boards', boardId)
  
  await updateDoc(boardRef, {
    collaborators: arrayUnion(userId)
  })
}

/**
 * Remove a collaborator from a board
 */
export const removeCollaborator = async (boardId, userId) => {
  const boardRef = doc(db, 'boards', boardId)
  await updateDoc(boardRef, {
    collaborators: arrayRemove(userId)
  })
}

/**
 * Remove a pending invite
 */
export const removePendingInvite = async (boardId, inviteId) => {
  await deleteDoc(doc(db, 'boards', boardId, 'invites', inviteId))
}

/**
 * Toggle board public status
 */
export const toggleBoardPublic = async (boardId, isPublic) => {
  const boardRef = doc(db, 'boards', boardId)
  await updateDoc(boardRef, { isPublic })
}

// ── Session Operations ────────────────────────────────────────────────────────

/**
 * Create a new canvas session
 */
export const createSession = async (boardId, name, isPrivate = false) => {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')

  const sessionRef = doc(collection(db, 'boards', boardId, 'sessions'))
  const emptyCanvas = { objects: [], version: '5.3.0' }
  const sessionData = {
    id: sessionRef.id,
    name,
    isPrivate,
    creatorId: user.uid,
    collaborators: [],
    canvasJson: JSON.stringify(emptyCanvas), // Store as string to avoid nested arrays
    background: '#ffffff',
    isActive: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }

  await setDoc(sessionRef, sessionData)
  // Return with parsed canvasJson for immediate use
  return { ...sessionData, canvasJson: emptyCanvas, id: sessionRef.id }
}

/**
 * Get all sessions for a board (filtered by user access)
 */
export const getSessions = async (boardId) => {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  
  const sessionsRef = collection(db, 'boards', boardId, 'sessions')
  const q = query(sessionsRef, orderBy('createdAt', 'desc'))
  const snapshot = await getDocs(q)
  
  const allSessions = snapshot.docs.map(doc => {
    const data = doc.data()
    // Parse canvasJson if it's a string
    if (data.canvasJson && typeof data.canvasJson === 'string') {
      data.canvasJson = JSON.parse(data.canvasJson)
    }
    return { id: doc.id, ...data }
  })
  
  // Filter sessions based on user access:
  // Sessions are only visible if:
  // - User is the creator, OR
  // - User is explicitly added as a collaborator to that session
  const accessibleSessions = allSessions.filter(session => {
    const isCreator = session.creatorId === user.uid
    const isCollaborator = (session.collaborators || []).includes(user.uid)
    
    console.log('[getSessions] Checking session:', session.name, {
      isPrivate: session.isPrivate,
      creatorId: session.creatorId,
      currentUserId: user.uid,
      isCreator,
      isCollaborator,
      collaborators: session.collaborators
    })
    
    const hasAccess = isCreator || isCollaborator
    console.log('[getSessions] Session access:', hasAccess)
    return hasAccess
  })
  
  console.log('[getSessions] Filtered', allSessions.length, 'sessions to', accessibleSessions.length, 'accessible sessions')
  
  return accessibleSessions
}

/**
 * Get a specific session
 */
export const getSession = async (boardId, sessionId) => {
  const sessionRef = doc(db, 'boards', boardId, 'sessions', sessionId)
  const sessionSnap = await getDoc(sessionRef)
  
  if (!sessionSnap.exists()) {
    throw new Error('Session not found')
  }
  
  const data = sessionSnap.data()
  
  // Parse canvasJson if it's a string (stored as JSON string to avoid nested arrays)
  if (data.canvasJson && typeof data.canvasJson === 'string') {
    data.canvasJson = JSON.parse(data.canvasJson)
  }
  
  return { id: sessionSnap.id, ...data }
}

/**
 * Update session canvas
 */
export const updateSession = async (boardId, sessionId, { canvasJson, background, name }) => {
  const sessionRef = doc(db, 'boards', boardId, 'sessions', sessionId)
  const updates = { updatedAt: serverTimestamp() }
  
  // Convert canvasJson to string to avoid Firestore nested arrays limitation
  if (canvasJson !== undefined) updates.canvasJson = JSON.stringify(canvasJson)
  if (background !== undefined) updates.background = background
  if (name !== undefined) updates.name = name
  
  await updateDoc(sessionRef, updates)
}

/**
 * Delete a session
 */
export const deleteSession = async (boardId, sessionId) => {
  await deleteDoc(doc(db, 'boards', boardId, 'sessions', sessionId))
}

// ── Real-time Listeners ───────────────────────────────────────────────────────

/**
 * Listen to board changes in real-time
 */
export const subscribeToBoard = (boardId, callback) => {
  const boardRef = doc(db, 'boards', boardId)
  return onSnapshot(boardRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data()
      // Parse canvasJson if it's a string
      if (data.canvasJson && typeof data.canvasJson === 'string') {
        data.canvasJson = JSON.parse(data.canvasJson)
      }
      callback({ id: snapshot.id, ...data })
    }
  })
}

/**
 * Listen to session changes in real-time
 */
export const subscribeToSession = (boardId, sessionId, callback) => {
  const sessionRef = doc(db, 'boards', boardId, 'sessions', sessionId)
  return onSnapshot(sessionRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data()
      // Parse canvasJson if it's a string
      if (data.canvasJson && typeof data.canvasJson === 'string') {
        data.canvasJson = JSON.parse(data.canvasJson)
      }
      callback({ id: snapshot.id, ...data })
    }
  })
}

/**
 * Listen to presence (active users) on a board
 */
export const subscribeToPresence = (boardId, callback) => {
  const presenceRef = collection(db, 'boards', boardId, 'presence')
  return onSnapshot(presenceRef, (snapshot) => {
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    callback(users)
  })
}

/**
 * Update user presence
 */
export const updatePresence = async (boardId, userData) => {
  const user = auth.currentUser
  if (!user) return

  const presenceRef = doc(db, 'boards', boardId, 'presence', user.uid)
  await setDoc(presenceRef, {
    ...userData,
    userId: user.uid,
    lastSeen: serverTimestamp()
  }, { merge: true })
}

/**
 * Remove user presence
 */
export const removePresence = async (boardId) => {
  const user = auth.currentUser
  if (!user) return

  const presenceRef = doc(db, 'boards', boardId, 'presence', user.uid)
  await deleteDoc(presenceRef)
}

// ── User Operations ───────────────────────────────────────────────────────────

/**
 * Create or update user profile
 */
export const updateUserProfile = async (userId, userData) => {
  const userRef = doc(db, 'users', userId)
  await setDoc(userRef, {
    ...userData,
    updatedAt: serverTimestamp()
  }, { merge: true })
}

/**
 * Search users by email or name
 */
export const searchUsers = async (emailQuery) => {
  const usersRef = collection(db, 'users')
  const q = query(
    usersRef,
    where('email', '>=', emailQuery.toLowerCase()),
    where('email', '<=', emailQuery.toLowerCase() + '\uf8ff'),
    limit(10)
  )
  const snapshot = await getDocs(q)
  const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  
  return { users, query: emailQuery }
}

// ── History Operations ────────────────────────────────────────────────────────

/**
 * Save a history snapshot for a user
 */
export const saveUserHistorySnapshot = async (boardId, sessionId, userEmail, snapshot) => {
  // Create a unique document for each snapshot
  const snapshotRef = doc(collection(db, 'boards', boardId, 'sessions', sessionId, 'userHistory'))
  
  await setDoc(snapshotRef, {
    userEmail: userEmail.replace(/[.@]/g, '_'),
    canvasJson: JSON.stringify(snapshot.canvasJson),
    timestamp: snapshot.timestamp,
    objectIds: snapshot.objectIds || [],
    createdAt: serverTimestamp()
  })
  
  return snapshotRef.id
}

/**
 * Get user history for a session
 */
export const getUserHistory = async (boardId, sessionId, userEmail) => {
  const normalizedEmail = userEmail.replace(/[.@]/g, '_')
  const historyRef = collection(db, 'boards', boardId, 'sessions', sessionId, 'userHistory')
  
  try {
    // Try with orderBy first (requires composite index)
    const q = query(
      historyRef, 
      where('userEmail', '==', normalizedEmail),
      orderBy('timestamp', 'asc'),
      limit(100)
    )
    
    const historySnap = await getDocs(q)
    
    const snapshots = historySnap.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        canvasJson: typeof data.canvasJson === 'string' ? JSON.parse(data.canvasJson) : data.canvasJson,
        timestamp: data.timestamp,
        objectIds: data.objectIds || [],
        userEmail: userEmail // Use original email, not normalized
      }
    })
    
    return {
      snapshots,
      currentIndex: snapshots.length > 0 ? snapshots.length - 1 : 0
    }
  } catch (err) {
    // If composite index doesn't exist, fall back to simple query and sort in memory
    console.warn('[getUserHistory] Composite index not found, using fallback query:', err.message)
    
    const simpleQuery = query(
      historyRef, 
      where('userEmail', '==', normalizedEmail),
      limit(100)
    )
    
    const historySnap = await getDocs(simpleQuery)
    
    const snapshots = historySnap.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        canvasJson: typeof data.canvasJson === 'string' ? JSON.parse(data.canvasJson) : data.canvasJson,
        timestamp: data.timestamp,
        objectIds: data.objectIds || [],
        userEmail: userEmail
      }
    })
    
    // Sort by timestamp in memory
    snapshots.sort((a, b) => a.timestamp - b.timestamp)
    
    return {
      snapshots,
      currentIndex: snapshots.length > 0 ? snapshots.length - 1 : 0
    }
  }
}

/**
 * Delete specific history snapshots by their IDs
 */
export const deleteUserHistorySnapshots = async (boardId, sessionId, snapshotIds) => {
  if (!snapshotIds || snapshotIds.length === 0) return
  
  const deletePromises = snapshotIds.map(snapshotId => {
    const snapshotRef = doc(db, 'boards', boardId, 'sessions', sessionId, 'userHistory', snapshotId)
    return deleteDoc(snapshotRef)
  })
  
  await Promise.all(deletePromises)
  console.log('[deleteUserHistorySnapshots] Deleted', snapshotIds.length, 'snapshots from Firestore')
}

/**
 * Update user history index (for undo/redo navigation)
 * Note: With individual snapshot documents, we don't need to store the index separately
 * The index is calculated from the snapshot array
 */
export const updateUserHistoryIndex = async (boardId, sessionId, userEmail, newIndex) => {
  // No-op: index is calculated from snapshots array
  // Keeping this function for API compatibility
  return Promise.resolve()
}

/**
 * Clear user history for a session
 */
export const clearUserHistory = async (boardId, sessionId, userEmail) => {
  const normalizedEmail = userEmail.replace(/[.@]/g, '_')
  const historyRef = collection(db, 'boards', boardId, 'sessions', sessionId, 'userHistory')
  const q = query(historyRef, where('userEmail', '==', normalizedEmail))
  
  const snapshot = await getDocs(q)
  const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref))
  await Promise.all(deletePromises)
}

/**
 * Clear ALL user history for a session (when canvas is cleared)
 */
export const clearAllSessionHistory = async (boardId, sessionId) => {
  const historyRef = collection(db, 'boards', boardId, 'sessions', sessionId, 'userHistory')
  const snapshot = await getDocs(historyRef)
  const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref))
  await Promise.all(deletePromises)
  console.log('[clearAllSessionHistory] Cleared', snapshot.docs.length, 'history snapshots')
}

/**
 * Get history snapshots
 */
export const getHistory = async (boardId, sessionId, limitCount = 100) => {
  const historyRef = collection(db, 'boards', boardId, 'sessions', sessionId, 'history')
  const q = query(historyRef, orderBy('createdAt', 'desc'), limit(limitCount))
  const snapshot = await getDocs(q)
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

/**
 * Clear history for a session
 */
export const clearHistory = async (boardId, sessionId) => {
  const historyRef = collection(db, 'boards', boardId, 'sessions', sessionId, 'history')
  const snapshot = await getDocs(historyRef)
  
  const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref))
  await Promise.all(deletePromises)
}

/**
 * Get session collaborators (full user data)
 */
export const getSessionCollaborators = async (boardId, sessionId) => {
  const session = await getSession(boardId, sessionId)
  
  // Get creator info
  const creatorRef = doc(db, 'users', session.creatorId)
  const creatorSnap = await getDoc(creatorRef)
  const creator = creatorSnap.exists() ? { id: creatorSnap.id, ...creatorSnap.data() } : null
  
  // Get collaborators info with their roles
  const collaborators = []
  for (const userId of session.collaborators || []) {
    const userRef = doc(db, 'users', userId)
    const userSnap = await getDoc(userRef)
    if (userSnap.exists()) {
      collaborators.push({
        id: userSnap.id,
        ...userSnap.data(),
        role: session.roles?.[userId] || 'editor'
      })
    }
  }
  
  return {
    creator,
    collaborators,
    isPrivate: session.isPrivate
  }
}

/**
 * Add collaborator to a session
 */
export const addSessionCollaborator = async (boardId, sessionId, email, role = 'editor') => {
  const result = await searchUsers(email)
  
  if (result.users.length === 0) {
    // Create pending invite for this session
    const inviteRef = doc(collection(db, 'boards', boardId, 'sessions', sessionId, 'invites'))
    await setDoc(inviteRef, {
      email: email.toLowerCase(),
      invitedAt: serverTimestamp(),
      status: 'pending',
      role
    })
    return { invited: true, email }
  }
  
  const userId = result.users[0].id
  const sessionRef = doc(db, 'boards', boardId, 'sessions', sessionId)
  await updateDoc(sessionRef, {
    collaborators: arrayUnion(userId),
    [`roles.${userId}`]: role
  })
  
  return { added: true, userId }
}

/**
 * Remove collaborator from a session
 */
export const removeSessionCollaborator = async (boardId, sessionId, userId) => {
  const sessionRef = doc(db, 'boards', boardId, 'sessions', sessionId)
  await updateDoc(sessionRef, {
    collaborators: arrayRemove(userId)
  })
}

/**
 * Update a collaborator's role on a specific session
 */
export const updateSessionCollaboratorRole = async (boardId, sessionId, userId, role) => {
  const sessionRef = doc(db, 'boards', boardId, 'sessions', sessionId)
  await updateDoc(sessionRef, {
    [`roles.${userId}`]: role
  })
}

/**
 * Update a collaborator's role on a board
 */
export const updateCollaboratorRole = async (boardId, userId, role) => {
  const boardRef = doc(db, 'boards', boardId)
  await updateDoc(boardRef, {
    [`roles.${userId}`]: role
  })
}

/**
 * Update a pending invite's role
 */
export const updateInviteRole = async (boardId, inviteId, role) => {
  const inviteRef = doc(db, 'boards', boardId, 'invites', inviteId)
  await updateDoc(inviteRef, { role })
}

/**
 * Get the current user's role on a board
 * Returns 'owner' | 'editor' | 'commentor' | 'viewer'
 */
export const getUserBoardRole = async (boardId) => {
  const user = auth.currentUser
  if (!user) return null

  const board = await getBoard(boardId)
  if (board.ownerId === user.uid) return 'owner'

  const role = board.roles?.[user.uid]
  if (role) return role

  // If user is in collaborators array but no explicit role, default to editor
  if ((board.collaborators || []).includes(user.uid)) return 'editor'

  // Public board
  if (board.isPublic) return board.defaultRole || 'viewer'

  return null
}

/**
 * Listen and resolve the current user's real-time role based on Board and Session documents.
 * Session role explicitly overrides Board role if set.
 * Returns an unsubscribe function.
 */
export const listenUserRole = (boardId, sessionId, userId, callback) => {
  if (!userId) return () => {}

  let boardRole = null
  let sessionRole = null
  let isBoardOwner = false
  let isPublic = false
  let defaultRole = 'viewer'

  const resolveAndNotify = () => {
    if (isBoardOwner) {
      callback('owner')
      return
    }
    // Session role takes absolute precedence if the user is a targeted session collaborator
    if (sessionRole) {
      callback(sessionRole)
      return
    }
    // Fallback to board role
    if (boardRole) {
      callback(boardRole)
      return
    }
    // Public fallback
    if (isPublic) {
      callback(defaultRole)
      return
    }
    callback('viewer')
  }

  const unsubBoard = onSnapshot(doc(db, 'boards', boardId), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data()
      isBoardOwner = data.ownerId === userId
      isPublic = !!data.isPublic
      defaultRole = data.defaultRole || 'viewer'
      
      const role = data.roles?.[userId]
      if (role) {
        boardRole = role
      } else if ((data.collaborators || []).includes(userId)) {
        boardRole = 'editor'
      } else {
        boardRole = null
      }
      resolveAndNotify()
    }
  })

  let unsubSession = () => {}
  if (sessionId) {
    unsubSession = onSnapshot(doc(db, 'boards', boardId, 'sessions', sessionId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data()
        const role = data.roles?.[userId]
        if (role) {
          sessionRole = role
        } else if ((data.collaborators || []).includes(userId)) {
          sessionRole = 'editor'
        } else {
          sessionRole = null
        }
        resolveAndNotify()
      }
    })
  }

  return () => {
    unsubBoard()
    unsubSession()
  }
}

/**
 * Get board collaborators
 */
export const getCollaborators = async (boardId) => {
  const board = await getBoard(boardId)
  
  // Get owner info
  const ownerRef = doc(db, 'users', board.ownerId)
  const ownerSnap = await getDoc(ownerRef)
  const owner = ownerSnap.exists() ? { id: ownerSnap.id, ...ownerSnap.data() } : null
  
  // Get collaborators info
  const collaborators = []
  for (const userId of board.collaborators || []) {
    const userRef = doc(db, 'users', userId)
    const userSnap = await getDoc(userRef)
    if (userSnap.exists()) {
      collaborators.push({ 
        id: userSnap.id, 
        ...userSnap.data(),
        role: board.roles?.[userId] || 'editor'
      })
    }
  }
  
  // Get pending invites
  const invitesRef = collection(db, 'boards', boardId, 'invites')
  const invitesSnap = await getDocs(invitesRef)
  const pendingInvites = invitesSnap.docs.map(doc => ({
    id: doc.id,
    email: doc.data().email,
    name: doc.data().email, // Use email as name for pending invites
    isPending: true,
    invitedAt: doc.data().invitedAt,
    role: doc.data().role || 'editor'
  }))
  
  return {
    owner,
    collaborators,
    pendingInvites,
    isPublic: board.isPublic,
    defaultRole: board.defaultRole || 'viewer'
  }
}

/**
 * Share board (make public or add collaborator)
 */
export const shareBoard = async (boardId, email = null, allowInvite = false, role = 'editor') => {
  const boardRef = doc(db, 'boards', boardId)
  
  if (email) {
    // Add specific collaborator
    const result = await searchUsers(email)
    
    if (result.users.length === 0) {
      if (!allowInvite) {
        throw new Error('User not found')
      }
      
      // Create pending invite
      const inviteRef = doc(collection(db, 'boards', boardId, 'invites'))
      await setDoc(inviteRef, {
        email: email.toLowerCase(),
        invitedAt: serverTimestamp(),
        status: 'pending',
        role: role
      })
      
      return { invited: true, email }
    }
    
    const userId = result.users[0].id
    await updateDoc(boardRef, {
      collaborators: arrayUnion(userId),
      [`roles.${userId}`]: role
    })
    
    return { added: true, userId }
  } else {
    // Make board public
    await updateDoc(boardRef, {
      isPublic: true,
      defaultRole: role
    })
    
    return { public: true }
  }
}
