# Per-User Undo/Redo System

## How It Works

The whiteboard now has a sophisticated per-user undo/redo system that works perfectly in collaborative environments, plus synchronized viewport for all users.

## Key Features

### 1. Per-User Undo/Redo
- Each user can only undo/redo their own changes
- User A's undo won't affect User B's or User C's drawings
- Each object is tagged with `createdBy` field containing the creator's email

### 2. Persistent History
- History is stored in Firestore and persists across page refreshes
- Refresh the page and you can still undo your previous changes
- History persists until you explicitly clear the canvas

### 3. Synchronized Viewport
- When one user pans or zooms, all other users see the same view in real-time
- Smooth synchronization with throttling to prevent jitter
- Works automatically - no configuration needed

### 4. Independent Sessions
- Each session has its own history and viewport
- Switching sessions gives you a fresh history for that session
   - History is stored at: `boards/{boardId}/sessions/{sessionId}/userHistory/{snapshotId}`

4. **Automatic Syncing**: Changes are broadcast to all collaborators in real-time
   - When you undo, other users see your objects disappear
   - When you redo, other users see your objects reappear

## Technical Details

### Data Structure

Each history snapshot contains:
- `canvasJson`: The canvas state (stored as JSON string to avoid Firestore nested arrays)
- `userEmail`: The user who created this snapshot (normalized: dots and @ replaced with _)
- `timestamp`: When the snapshot was created
- `objectIds`: Array of object IDs present in this snapshot

### Firestore Collections

```
boards/{boardId}/sessions/{sessionId}/userHistory/{snapshotId}
  - userEmail: string (normalized)
  - canvasJson: string (JSON stringified)
  - timestamp: number
  - objectIds: array
  - createdAt: timestamp
```

### How Undo Works

1. Filter history to get only current user's snapshots
2. Find current position in user's history
3. Go to previous snapshot
4. Apply snapshot by:
   - Removing objects created by user that aren't in snapshot
   - Adding/updating objects from snapshot that belong to user
   - Keeping other users' objects untouched
5. Broadcast changes to all collaborators
6. Save to database

### How Redo Works

Same as undo, but moves forward in history instead of backward.

## Usage

- **Undo**: Click undo button or press Ctrl+Z (Cmd+Z on Mac)
- **Redo**: Click redo button or press Ctrl+Y (Cmd+Y on Mac)
- **Clear History**: Click "Clear Canvas" - this removes all objects and resets history for all users
- **Pan**: Hold Space + drag, or use middle mouse button
- **Zoom**: Ctrl/Cmd + scroll wheel
- **Viewport Sync**: Automatic - when you pan/zoom, other users follow your view

## How Viewport Sync Works

1. When you pan or zoom, your viewport state is saved to your presence document
2. Other users receive the viewport update in real-time
3. Their canvas automatically pans/zooms to match your view
4. Updates are throttled (150ms) to prevent jitter and excessive writes
5. Each user's viewport changes are broadcast to all collaborators

## Limitations

- Maximum 100 snapshots per user per session (oldest are kept)
- Undo/redo buttons are disabled when at the beginning/end of your history
- History is cleared when canvas is cleared
