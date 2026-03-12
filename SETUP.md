# Firebase Setup Guide

## Quick Start

Follow these steps to get your whiteboard app running with Firebase:

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Create Firebase Project

1. Visit [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or "Create a project"
3. Enter a project name (e.g., "my-whiteboard-app")
4. Disable Google Analytics (optional, you can enable it later)
5. Click "Create project"

### Step 3: Enable Authentication

1. In your Firebase project, click "Authentication" in the left sidebar
2. Click "Get started"
3. Click on "Google" provider:
   - Toggle "Enable"
   - Add your email as a test user
   - Click "Save"
4. Click on "Email/Password" provider:
   - Toggle "Enable"
   - Click "Save"

### Step 4: Create Firestore Database

1. Click "Firestore Database" in the left sidebar
2. Click "Create database"
3. Select "Start in production mode"
4. Choose a location (select one closest to your users)
5. Click "Enable"

### Step 5: Add Security Rules

1. In Firestore Database, click the "Rules" tab
2. Replace the default rules with the rules from `FIREBASE_MIGRATION.md`
3. Click "Publish"

### Step 6: Get Your Firebase Config

1. Click the gear icon (⚙️) next to "Project Overview"
2. Click "Project settings"
3. Scroll down to "Your apps"
4. Click the web icon `</>`
5. Register your app with a nickname (e.g., "Whiteboard Web")
6. Copy the `firebaseConfig` object values

### Step 7: Configure Environment Variables

1. Open the `.env` file in your project root
2. Replace the placeholder values with your Firebase config:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

### Step 8: Run the App

```bash
npm run dev
```

Your app should now be running at `http://localhost:5173`

## Testing

1. Open the app in your browser
2. Click "Sign in with Google" or create an account with email/password
3. Create a new board
4. Open the same board in another browser tab or incognito window
5. Draw on one tab and watch it appear in real-time on the other!

## Troubleshooting

### "Firebase: Error (auth/unauthorized-domain)"
- Go to Firebase Console > Authentication > Settings > Authorized domains
- Add `localhost` and your production domain

### "Missing or insufficient permissions"
- Check that you've published the Firestore security rules
- Make sure you're signed in

### Real-time updates not working
- Check browser console for errors
- Verify Firestore rules allow read/write access
- Make sure you're on the same board in both tabs

## Next Steps

- Customize the UI
- Add more drawing tools
- Deploy to production (Netlify, Vercel, Firebase Hosting)
- Invite collaborators

## Need Help?

Check `FIREBASE_MIGRATION.md` for detailed architecture information.
