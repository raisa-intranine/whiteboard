# Firebase Quick Reference

## Common Operations

### Authentication

```javascript
import { signInWithGoogle, signUpWithEmail, signOut } from './services/auth'

// Sign in with Google
const user = await signInWithGoogle()

// Sign up with email
const user = await signUpWithEmail(email, password, name)

// Sign out
await signOut()

// Listen to auth changes
onAuthChange((user) => {
  if (user) {
    console.log('Signed in:', user.email)
  } else {
    console.log('Signed out')
  }
})
```

### Board Operations

```javascript
import { createBoard, getBoard, updateBoard, getUserBoards } from './services/firestore'

// Create a new board
const board = await createBoard('My Board')

// Get a board
const board = await getBoard(boardId)

// Update board canvas
await updateBoard(boardId, {
  canvasJson: canvas.toJSON(),
  background: '#ffffff'
})

// Get user's boards
const boards = await getUserBoards()
```

### Real-time Sync

```javascript
import { subscribeToBoard, subscribeToSession } from './services/firestore'

// Listen to board changes
const unsubscribe = subscribeToBoard(boardId, (board) => {
  console.log('Board updated:', board)
  // Update your UI here
})

// Listen to session changes
const unsubscribe = subscribeToSession(boardId, sessionId, (session) => {
  console.log('Session updated:', session)
  // Load canvas from session.canvasJson
})

// Clean up when component unmounts
unsubscribe()
```

### Presence (Active Users)

```javascript
import { updatePresence, subscribeToPresence, removePresence } from './services/firestore'

// Join board (show as active)
await updatePresence(boardId, {
  name: user.displayName,
  email: user.email,
  isEditing: false
})

// Update presence
await updatePresence(boardId, {
  name: user.displayName,
  email: user.email,
  isEditing: true
})

// Listen to presence changes
const unsubscribe = subscribeToPresence(boardId, (users) => {
  console.log('Active users:', users)
  // Update presence indicators
})

// Leave board
await removePresence(boardId)
```

### Sessions

```javascript
import { createSession, getSessions, updateSession, deleteSession } from './services/firestore'

// Create a session
const session = await createSession(boardId, 'Session 1', false)

// Get all sessions
const sessions = await getSessions(boardId)

// Update session
await updateSession(boardId, sessionId, {
  canvasJson: canvas.toJSON(),
  background: '#ffffff'
})

// Delete session
await deleteSession(boardId, sessionId)
```

### Collaboration

```javascript
import { addCollaborator, removeCollaborator, toggleBoardPublic } from './services/firestore'

// Add collaborator by email
await addCollaborator(boardId, 'user@example.com')

// Remove collaborator
await removeCollaborator(boardId, userId)

// Make board public
await toggleBoardPublic(boardId, true)
```

## Component Integration Examples

### Authgate Component

```javascript
import { signInWithGoogle, signUpWithEmail, onAuthChange } from '../services/auth'

function Authgate({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setUser(user)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle()
    } catch (error) {
      console.error('Sign in failed:', error)
    }
  }

  if (loading) return <div>Loading...</div>
  if (!user) return <LoginUI onGoogleSignIn={handleGoogleSignIn} />
  return children
}
```

### Whiteboard Component

```javascript
import { subscribeToBoard, updateBoard } from '../services/firestore'

function Whiteboard({ boardId }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    // Subscribe to real-time updates
    const unsubscribe = subscribeToBoard(boardId, (board) => {
      if (board.canvasJson) {
        canvasRef.current.loadFromJSON(board.canvasJson)
      }
    })

    return unsubscribe
  }, [boardId])

  const handleSave = async () => {
    await updateBoard(boardId, {
      canvasJson: canvasRef.current.toJSON(),
      background: '#ffffff'
    })
  }

  return <canvas ref={canvasRef} />
}
```

## Error Handling

```javascript
try {
  await createBoard('My Board')
} catch (error) {
  if (error.code === 'permission-denied') {
    console.error('You do not have permission')
  } else if (error.code === 'not-found') {
    console.error('Board not found')
  } else {
    console.error('Error:', error.message)
  }
}
```

## Best Practices

1. **Always unsubscribe from listeners** when components unmount
2. **Use try-catch** for all async operations
3. **Debounce canvas updates** to avoid too many writes
4. **Check auth state** before Firestore operations
5. **Use security rules** to protect data
6. **Enable offline persistence** for better UX

## Debugging

```javascript
// Check if user is authenticated
import { getCurrentUser } from './services/auth'
console.log('Current user:', getCurrentUser())

// Check Firestore connection
import { db } from './services/firebase'
console.log('Firestore instance:', db)

// Enable Firestore debug logging
import { enableIndexedDbPersistence } from 'firebase/firestore'
enableIndexedDbPersistence(db, { synchronizeTabs: true })
  .then(() => console.log('Persistence enabled'))
  .catch(console.error)
```
