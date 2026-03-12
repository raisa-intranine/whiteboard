# Before & After: Firebase Migration

## Code Comparison

### Authentication

#### Before (Old API)
```javascript
// Login
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
})
const { token } = await response.json()
localStorage.setItem('wb_jwt', token)

// Check auth
const token = localStorage.getItem('wb_jwt')
const response = await fetch('/api/auth/me', {
  headers: { 'Authorization': `Bearer ${token}` }
})
const user = await response.json()
```

#### After (Firebase)
```javascript
// Login
import { signInWithEmail } from './services/auth'
const user = await signInWithEmail(email, password)

// Check auth
import { onAuthChange } from './services/auth'
onAuthChange((user) => {
  if (user) {
    console.log('Signed in:', user.email)
  }
})
```

### Loading a Board

#### Before (Old API)
```javascript
const response = await fetch(`/api/boards/${boardId}`, {
  headers: { 'Authorization': `Bearer ${token}` }
})
const board = await response.json()
canvas.loadFromJSON(board.canvasJson)
```

#### After (Firebase)
```javascript
import { getBoard } from './services/firestore'
const board = await getBoard(boardId)
canvas.loadFromJSON(board.canvasJson)
```

### Real-time Sync

#### Before (Ably)
```javascript
import * as Ably from 'ably'

// Initialize
const client = new Ably.Realtime({ authCallback: ... })
const channel = client.channels.get(`board:${boardId}`)

// Subscribe
channel.subscribe('canvas:sync', (msg) => {
  canvas.loadFromJSON(msg.data.canvasJson)
})

// Publish
channel.publish('canvas:sync', {
  type: 'canvas:full',
  canvasJson: canvas.toJSON()
})

// Cleanup
channel.unsubscribe()
client.close()
```

#### After (Firestore)
```javascript
import { subscribeToBoard, updateBoard } from './services/firestore'

// Subscribe (automatic real-time updates)
const unsubscribe = subscribeToBoard(boardId, (board) => {
  canvas.loadFromJSON(board.canvasJson)
})

// Update (automatically syncs to all clients)
await updateBoard(boardId, {
  canvasJson: canvas.toJSON()
})

// Cleanup
unsubscribe()
```

### Presence (Active Users)

#### Before (Ably)
```javascript
// Enter presence
await channel.presence.enter({
  name: user.name,
  email: user.email
})

// Subscribe to presence
channel.presence.subscribe('enter', (member) => {
  console.log('User joined:', member.data.name)
})

// Leave presence
await channel.presence.leave()
```

#### After (Firestore)
```javascript
import { updatePresence, subscribeToPresence, removePresence } from './services/firestore'

// Enter presence
await updatePresence(boardId, {
  name: user.displayName,
  email: user.email
})

// Subscribe to presence
const unsubscribe = subscribeToPresence(boardId, (users) => {
  console.log('Active users:', users)
})

// Leave presence
await removePresence(boardId)
```

## Architecture Comparison

### Before
```
┌─────────────┐
│   React     │
│   Frontend  │
└──────┬──────┘
       │
       │ HTTP + JWT
       │
┌──────┴──────┐      ┌──────────┐
│   Express   │──────│PostgreSQL│
│   Backend   │      └──────────┘
└──────┬──────┘
       │
       │ WebSocket
       │
┌──────┴──────┐
│    Ably     │
│  (Realtime) │
└─────────────┘
```

### After
```
┌─────────────┐
│   React     │
│   Frontend  │
└──────┬──────┘
       │
       │ Firebase SDK
       │
┌──────┴──────────────┐
│     Firebase        │
│  ┌──────┐ ┌──────┐ │
│  │ Auth │ │Firestore│
│  └──────┘ └──────┘ │
└─────────────────────┘
```

## Deployment Comparison

### Before
```bash
# Backend (Render/Heroku)
1. Set up PostgreSQL database
2. Configure environment variables
3. Run migrations
4. Deploy Express server
5. Set up Ably account
6. Configure Ably API keys

# Frontend (Netlify)
1. Build React app
2. Configure API URL
3. Deploy static files
```

### After
```bash
# Firebase (One service)
1. Create Firebase project
2. Enable Auth and Firestore
3. Set security rules

# Frontend (Any static host)
1. Build React app
2. Deploy static files
```

## Cost Comparison

### Before (Monthly estimates for small app)
- PostgreSQL hosting: $7-25
- Backend hosting: $7-25
- Ably: $0-29 (free tier limited)
- **Total: $14-79/month**

### After (Monthly estimates for small app)
- Firebase free tier:
  - 50K reads/day
  - 20K writes/day
  - 1GB storage
  - 10GB bandwidth
- **Total: $0-5/month** (most small apps stay free)

## Maintenance Comparison

### Before
- Maintain backend server code
- Manage database migrations
- Monitor server health
- Handle WebSocket connections
- Manage JWT tokens
- Update dependencies (backend + frontend)
- Debug sync issues

### After
- Update frontend code only
- Firebase handles infrastructure
- Automatic scaling
- Built-in monitoring
- Automatic token management
- Update frontend dependencies only
- Real-time sync just works

## Developer Experience

### Before
- 3 services to configure (PostgreSQL, Express, Ably)
- Complex local development setup
- Manual sync logic
- More code to maintain
- Longer onboarding for new developers

### After
- 1 service to configure (Firebase)
- Simple local development
- Automatic sync
- Less code to maintain
- Faster onboarding

## Performance

### Before
- HTTP request latency
- WebSocket connection overhead
- Database query time
- Backend processing time

### After
- Direct Firebase SDK connection
- Optimized real-time listeners
- Automatic caching
- Offline support built-in

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Services | 3 (PostgreSQL, Express, Ably) | 1 (Firebase) |
| Backend Code | ~2000 lines | 0 lines |
| Real-time | Manual (Ably) | Automatic (Firestore) |
| Offline | Not supported | Built-in |
| Cost | $14-79/month | $0-5/month |
| Deployment | Complex | Simple |
| Maintenance | High | Low |
| Scalability | Manual | Automatic |
