# Firebase Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend (Vite)                    │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Authgate   │  │  Whiteboard  │  │SessionManager│      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │               │
│         └──────────────────┼──────────────────┘               │
│                            │                                  │
│  ┌─────────────────────────┴─────────────────────────┐      │
│  │           Firebase Services Layer                  │      │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐        │      │
│  │  │   auth   │  │ firestore│  │ firebase │        │      │
│  │  │   .js    │  │   .js    │  │   .js    │        │      │
│  │  └──────────┘  └──────────┘  └──────────┘        │      │
│  └────────────────────────────────────────────────────┘      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ Firebase SDK
                            │
┌───────────────────────────┴─────────────────────────────────┐
│                      Firebase Cloud                          │
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │  Firebase Auth   │         │    Firestore     │          │
│  │                  │         │                  │          │
│  │  • Google OAuth  │         │  • boards/       │          │
│  │  • Email/Pass    │         │  • users/        │          │
│  │  • User tokens   │         │  • Real-time     │          │
│  └──────────────────┘         │  • Offline sync  │          │
│                                └──────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Authentication Flow
```
User clicks "Sign in with Google"
         ↓
signInWithGoogle() called
         ↓
Firebase Auth popup opens
         ↓
User authenticates with Google
         ↓
Firebase returns user object
         ↓
updateUserProfile() saves to Firestore
         ↓
onAuthChange() notifies components
         ↓
User is signed in
```

### Real-time Collaboration Flow
```
User A draws on canvas
         ↓
updateBoard() or updateSession() called
         ↓
Firestore document updated
         ↓
Firestore triggers real-time listener
         ↓
subscribeToBoard() callback fires on User B's device
         ↓
Canvas loads new data
         ↓
User B sees User A's drawing in real-time
```

### Presence Flow
```
User joins board
         ↓
updatePresence() called
         ↓
Document created in boards/{id}/presence/{userId}
         ↓
subscribeToPresence() listener fires
         ↓
All users see new presence indicator
         ↓
User leaves board
         ↓
removePresence() called
         ↓
Presence document deleted
         ↓
Presence indicator removed for all users
```

## Firestore Data Structure

```
firestore
│
├── users/
│   └── {userId}
│       ├── email: string
│       ├── name: string
│       ├── photoURL: string
│       └── createdAt: timestamp
│
└── boards/
    └── {boardId}
        ├── id: string
        ├── title: string
        ├── ownerId: string
        ├── collaborators: [userId1, userId2]
        ├── isPublic: boolean
        ├── canvasJson: object
        ├── background: string
        ├── createdAt: timestamp
        ├── updatedAt: timestamp
        │
        ├── sessions/
        │   └── {sessionId}
        │       ├── id: string
        │       ├── name: string
        │       ├── isPrivate: boolean
        │       ├── creatorId: string
        │       ├── collaborators: [userId1]
        │       ├── canvasJson: object
        │       ├── background: string
        │       ├── isActive: boolean
        │       ├── createdAt: timestamp
        │       ├── updatedAt: timestamp
        │       │
        │       └── history/
        │           └── {historyId}
        │               ├── snapshot: object
        │               └── createdAt: timestamp
        │
        └── presence/
            └── {userId}
                ├── userId: string
                ├── name: string
                ├── email: string
                ├── isEditing: boolean
                └── lastSeen: timestamp
```

## Security Model

### Authentication
- Firebase Auth handles user authentication
- Supports Google OAuth and Email/Password
- JWT tokens managed automatically by Firebase

### Authorization
- Firestore Security Rules enforce access control
- Board owners have full access
- Collaborators have read/write access
- Public boards are readable by anyone
- Private sessions only accessible to specific users

### Security Rules Logic
```
Can read board if:
  - User is owner, OR
  - User is collaborator, OR
  - Board is public

Can write board if:
  - User is owner, OR
  - User is collaborator

Can delete board if:
  - User is owner
```

## Advantages Over Old Architecture

### Old (PostgreSQL + Ably)
- ❌ Separate backend server required
- ❌ Manual WebSocket management
- ❌ Complex sync logic
- ❌ Two services to maintain (DB + Ably)
- ❌ More expensive at scale
- ❌ Manual offline support

### New (Firebase/Firestore)
- ✅ No backend server needed
- ✅ Automatic real-time sync
- ✅ Built-in offline support
- ✅ Single service for everything
- ✅ Pay-as-you-go pricing
- ✅ Automatic scaling
- ✅ Built-in security rules
- ✅ Simpler deployment

## Performance Considerations

### Optimizations
1. **Debounce canvas updates** - Don't save on every stroke
2. **Use subcollections** - Sessions and history don't bloat main board doc
3. **Limit history** - Keep only recent snapshots
4. **Presence cleanup** - Remove stale presence docs
5. **Indexed queries** - Add indexes for common queries

### Firestore Limits
- Max document size: 1 MB
- Max writes per second per document: 1
- Max subcollection depth: 100 levels

### Best Practices
- Keep canvas JSON under 1 MB
- Batch related updates
- Use transactions for critical operations
- Clean up old history periodically
- Use presence heartbeat for active users

## Monitoring

### Firebase Console
- Authentication metrics
- Firestore usage and costs
- Real-time active users
- Error logs

### Client-side
- Console logs for debugging
- Error boundaries for React
- Network status monitoring
- Offline/online indicators
