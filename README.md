# Collaborative Whiteboard

A real-time collaborative whiteboard application powered by Firebase and Firestore.

## 🚀 Quick Start

**This app has been migrated to Firebase!** Follow these steps:

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up Firebase** (5 minutes)
   - Follow the detailed guide in [`SETUP.md`](SETUP.md)
   - Create a Firebase project
   - Enable Authentication and Firestore
   - Update your `.env` file

3. **Run the app**
   ```bash
   npm run dev
   ```

## ✨ Features

- 🎨 **Drawing Tools**: Pen, shapes, lines, arrows, text, images
- 👥 **Real-time Collaboration**: Multiple users can draw simultaneously
- 🔐 **Authentication**: Google OAuth sign-in
- 💾 **Auto-save**: Changes saved automatically to Firestore
- 📱 **Offline Support**: Works offline, syncs when back online
- 🎯 **Canvas Sessions**: Multiple sessions per board
- 👀 **Live Presence**: See who's currently viewing the board
- 📜 **History**: Undo/redo with snapshot history
- 🔗 **Sharing**: Invite collaborators or make boards public
- ⌨️ **Keyboard Shortcuts**: Delete, Copy (Ctrl+C), Paste (Ctrl+V)

## 📚 Documentation

- **[SETUP.md](SETUP.md)** - Step-by-step Firebase setup guide
- **[MIGRATION_CHECKLIST.md](MIGRATION_CHECKLIST.md)** - Track migration progress
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - Code examples and API reference
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture and data flow
- **[FIREBASE_MIGRATION.md](FIREBASE_MIGRATION.md)** - Detailed migration guide

## 🛠️ Tech Stack

- **Frontend**: React 18 + Vite
- **Canvas**: Fabric.js
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Real-time**: Firestore real-time listeners
- **Diagrams**: Mermaid.js

## 📦 Building for Production

```bash
npm run build
```

Deploy the `dist/` folder to:
- Firebase Hosting
- Netlify
- Vercel
- Any static hosting service

## 🔧 Migration Status

✅ Firebase infrastructure ready
🔄 Component updates in progress

See [`MIGRATION_STATUS.md`](MIGRATION_STATUS.md) for details.

## 📝 License

MIT
