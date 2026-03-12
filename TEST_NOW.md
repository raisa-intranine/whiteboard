# 🧪 Test Your Firebase Migration NOW!

## Current Status: READY TO TEST ✅

All code has been migrated to Firebase. Here's how to test it:

## Step 1: Enable Firestore (2 minutes)

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select project: **even-affinity-471618-n9**
3. Click "Firestore Database" in left sidebar
4. Click "Create database"
5. Choose **"Start in test mode"** (important!)
6. Select a location (any is fine)
7. Click "Enable"

## Step 2: Enable Authentication (2 minutes)

1. Click "Authentication" in left sidebar
2. Click "Get started"
3. Click "Google" provider:
   - Toggle "Enable"
   - Click "Save"
4. Click "Email/Password" provider:
   - Toggle "Enable"
   - Click "Save"

## Step 3: Add localhost to Authorized Domains

1. In Authentication, click "Settings" tab
2. Scroll to "Authorized domains"
3. Click "Add domain"
4. Enter: `localhost`
5. Click "Add"

## Step 4: Run the App

```bash
npm run dev
```

## Step 5: Test Authentication

1. Open `http://localhost:5173`
2. Click "Sign in with Google"
3. Sign in with your Google account
4. You should see the whiteboard!

## Step 6: Test Real-time Collaboration

1. Draw something on the canvas
2. Open the same URL in an incognito window: `http://localhost:5173`
3. Sign in with a DIFFERENT Google account (or create a different email account)
4. You should see the same board!
5. Draw in one window - it should appear in the other in real-time!

## 🎯 What to Test

### Authentication
- [ ] Google sign-in works
- [ ] Email sign-up works
- [ ] Email sign-in works
- [ ] Sign out works
- [ ] Refresh page - should stay signed in

### Board Operations
- [ ] Can draw on canvas
- [ ] Can use different tools
- [ ] Can change colors
- [ ] Can undo/redo
- [ ] Can clear canvas

### Real-time Sync
- [ ] Open in two tabs (same account)
- [ ] Draw in one tab
- [ ] See it appear in other tab immediately
- [ ] Both tabs stay in sync

### Sessions
- [ ] Click the session dropdown (📋 button in top bar)
- [ ] Create a new session
- [ ] Switch between sessions
- [ ] Each session has its own canvas

### Collaboration
- [ ] Open in two browsers with different accounts
- [ ] Both can draw
- [ ] See each other's changes in real-time
- [ ] See presence indicators (avatars in top right)

## 🐛 Common Issues

### "Firebase: Error (auth/unauthorized-domain)"
**Fix:** Add `localhost` to authorized domains (Step 3 above)

### "Missing or insufficient permissions"
**Fix:** Make sure Firestore is in "test mode" (Step 1 above)

### "Cannot read properties of undefined"
**Fix:** Make sure you completed Steps 1 & 2 (Firestore and Auth must be enabled)

### Nothing happens when I sign in
**Fix:** Check browser console (F12) for errors

### Real-time not working
**Fix:** 
- Check that Firestore is enabled
- Check browser console for errors
- Make sure both tabs are signed in
- Try refreshing both tabs

## 📊 Expected Behavior

### First Time
1. Sign in → Creates user in Firestore
2. Whiteboard loads → Creates a board automatically
3. Draw → Saves to Firestore
4. Open another tab → Loads same board
5. Draw in either tab → Syncs in real-time!

### Subsequent Visits
1. Sign in → Loads your existing board
2. All your drawings are there
3. Real-time sync works immediately

## 🎉 Success Indicators

You'll know it's working when:
- ✅ You can sign in without errors
- ✅ You can draw on the canvas
- ✅ Opening another tab shows the same canvas
- ✅ Drawing in one tab appears in the other
- ✅ You see presence indicators (avatars) when multiple users are online

## 🔍 Debugging

If something doesn't work:

1. Open browser console (F12)
2. Look for errors (red text)
3. Share the error with me
4. I'll help you fix it!

## 📝 After Testing

Once everything works:

1. Check off items in `MIGRATION_CHECKLIST.md`
2. Add proper security rules (see `FIREBASE_MIGRATION.md`)
3. Delete the old `backend/` folder
4. Deploy to production!

## 🚀 Ready?

Run this command and let's see it work:

```bash
npm run dev
```

Then follow Steps 1-6 above!

---

**Having issues?** Just tell me what error you're seeing and I'll help fix it!
