# Firebase Migration Checklist

Use this checklist to track your migration progress.

## Phase 1: Firebase Setup ✅

- [x] Install Firebase SDK
- [x] Create Firebase service files
- [x] Create Firestore operations
- [x] Create Auth service
- [x] Remove Ably and ws dependencies
- [x] Update environment variables
- [ ] Create Firebase project in console
- [ ] Enable Authentication (Google + Email)
- [ ] Create Firestore database
- [ ] Add security rules
- [ ] Get Firebase config and update .env

## Phase 2: Component Updates

### Authgate Component
- [ ] Import Firebase auth functions
- [ ] Replace old login API with `signInWithGoogle()`
- [ ] Replace old signup API with `signUpWithEmail()`
- [ ] Use `onAuthChange()` for auth state
- [ ] Remove JWT token logic
- [ ] Test Google sign-in
- [ ] Test email sign-up
- [ ] Test sign-out

### App Component
- [ ] Update auth state management
- [ ] Remove old API initialization
- [ ] Add Firebase auth listener
- [ ] Test auth persistence

### Whiteboard Component
- [ ] Replace `loadBoard()` API call with `getBoard()`
- [ ] Replace `saveBoard()` API call with `updateBoard()`
- [ ] Remove Ably initialization
- [ ] Add `subscribeToBoard()` or `subscribeToSession()`
- [ ] Update canvas load logic
- [ ] Update canvas save logic
- [ ] Test real-time sync between tabs
- [ ] Test offline support

### SessionManager Component
- [ ] Replace session API calls with Firestore functions
- [ ] Use `createSession()` for new sessions
- [ ] Use `getSessions()` to list sessions
- [ ] Use `updateSession()` to save
- [ ] Use `deleteSession()` to remove
- [ ] Test session creation
- [ ] Test session switching
- [ ] Test session deletion

### ShareModal Component
- [ ] Replace share API with `addCollaborator()`
- [ ] Replace remove API with `removeCollaborator()`
- [ ] Use `toggleBoardPublic()` for public sharing
- [ ] Use `searchUsers()` for user search
- [ ] Test adding collaborators
- [ ] Test removing collaborators
- [ ] Test public board toggle

### PresenceIndicators Component
- [ ] Remove Ably presence logic
- [ ] Add `updatePresence()` on mount
- [ ] Add `subscribeToPresence()` listener
- [ ] Add `removePresence()` on unmount
- [ ] Test presence indicators
- [ ] Test multiple users

## Phase 3: Cleanup

- [ ] Remove `src/services/api.js`
- [ ] Remove `src/services/realtime.js`
- [ ] Archive or delete `backend/` folder
- [ ] Update main README.md
- [ ] Remove backend .env file
- [ ] Update .gitignore if needed

## Phase 4: Testing

### Authentication
- [ ] Sign in with Google works
- [ ] Sign up with email works
- [ ] Sign out works
- [ ] Auth state persists on refresh
- [ ] Unauthorized access is blocked

### Board Operations
- [ ] Create new board
- [ ] Load existing board
- [ ] Save board changes
- [ ] Delete board
- [ ] List user boards

### Real-time Collaboration
- [ ] Open same board in two tabs
- [ ] Draw in one tab, see in other
- [ ] Multiple users can collaborate
- [ ] Presence indicators show active users
- [ ] Changes sync in real-time

### Sessions
- [ ] Create new session
- [ ] Switch between sessions
- [ ] Save session changes
- [ ] Delete session
- [ ] Session privacy works

### Offline Support
- [ ] App works offline
- [ ] Changes sync when back online
- [ ] No errors in offline mode

## Phase 5: Deployment

- [ ] Build production bundle (`npm run build`)
- [ ] Test production build locally
- [ ] Deploy to hosting (Firebase/Netlify/Vercel)
- [ ] Add production domain to Firebase authorized domains
- [ ] Test production deployment
- [ ] Update documentation with production URL

## Notes

- Take it one component at a time
- Test after each component update
- Keep the old code commented out initially
- Remove old code only after testing

## Need Help?

- Check `QUICK_REFERENCE.md` for code examples
- Check `FIREBASE_MIGRATION.md` for architecture details
- Check `SETUP.md` for Firebase setup steps
