# 📸 Visual Guide - Firebase Setup

## Step-by-Step with Screenshots

### Step 1: Open Firebase Console

Go to: https://console.firebase.google.com/

You should see your project: **even-affinity-471618-n9**

Click on it.

---

### Step 2: Enable Firestore

**What you'll see:**
```
Left Sidebar:
├── Project Overview
├── Authentication
├── Firestore Database  ← Click this
├── Storage
└── ...
```

**What to do:**
1. Click "Firestore Database"
2. Click the blue "Create database" button
3. A modal appears with two options:
   - ⚪ Start in production mode
   - 🔵 Start in test mode ← **Select this**
4. Click "Next"
5. Choose a location (any is fine, pick closest to you)
6. Click "Enable"
7. Wait 30 seconds for it to initialize

**You'll know it worked when:**
- You see an empty database with tabs: Data, Rules, Indexes, Usage

---

### Step 3: Enable Authentication

**What you'll see:**
```
Left Sidebar:
├── Project Overview
├── Authentication  ← Click this
├── Firestore Database
└── ...
```

**What to do:**
1. Click "Authentication"
2. Click "Get started" button
3. You'll see a list of sign-in providers
4. Click on "Google":
   - Toggle the "Enable" switch
   - Support email should be pre-filled
   - Click "Save"
5. Click on "Email/Password":
   - Toggle the "Enable" switch
   - Click "Save"

**You'll know it worked when:**
- Google shows "Enabled" status
- Email/Password shows "Enabled" status

---

### Step 4: Add Authorized Domain

**What you'll see:**
```
Authentication page:
├── Users tab
├── Sign-in method tab
├── Templates tab
├── Settings tab  ← Click this
└── Usage tab
```

**What to do:**
1. Click "Settings" tab
2. Scroll down to "Authorized domains" section
3. You should see:
   - even-affinity-471618-n9.firebaseapp.com (already there)
   - localhost (might not be there)
4. If `localhost` is missing:
   - Click "Add domain"
   - Type: `localhost`
   - Click "Add"

**You'll know it worked when:**
- You see `localhost` in the list of authorized domains

---

### Step 5: Run Your App

**Open your terminal:**
```bash
cd ~/Documents/docs/Raisa-Whiteboard/whiteboard-intranine-main
npm run dev
```

**You'll see:**
```
VITE v7.3.1  ready in 500 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

**Open browser:**
Go to: http://localhost:5173

---

### Step 6: Test Sign In

**What you'll see:**
- A beautiful login page with "Sign in with Google" button

**What to do:**
1. Click "Sign in with Google"
2. Choose your Google account
3. Allow permissions
4. You should see the whiteboard!

---

### Step 7: Test Real-time

**What to do:**
1. Draw something on the canvas
2. Open a new incognito window
3. Go to: http://localhost:5173
4. Sign in with a DIFFERENT account
5. You should see the same drawing!
6. Draw in one window
7. Watch it appear in the other window in real-time!

**You'll know it worked when:**
- Both windows show the same canvas
- Drawing in one appears in the other instantly
- You see presence indicators (avatars) in top right

---

## 🎉 Success!

If you made it here, your whiteboard is now running on Firebase!

## 🐛 Troubleshooting

### Error: "Firebase: Error (auth/unauthorized-domain)"
**Fix:** Go back to Step 4 and add `localhost` to authorized domains

### Error: "Missing or insufficient permissions"
**Fix:** Go back to Step 2 and make sure you selected "test mode"

### Nothing happens when I click sign in
**Fix:** 
1. Open browser console (F12)
2. Look for red errors
3. Share the error with me

### Real-time not working
**Fix:**
1. Make sure Firestore is enabled (Step 2)
2. Make sure both tabs are signed in
3. Try refreshing both tabs
4. Check browser console for errors

---

## 📞 Need Help?

Just tell me:
- What step you're on
- What you see on screen
- Any error messages

I'll help you fix it!

---

## 🚀 Next Steps After Testing

1. ✅ Test everything works
2. 📋 Check off items in `MIGRATION_CHECKLIST.md`
3. 🔒 Add security rules (see `FIREBASE_MIGRATION.md`)
4. 🗑️ Delete the `backend/` folder
5. 🌐 Deploy to production!

---

**Ready?** Start with Step 1 above!
