# Collaborative Whiteboard - Firebase Edition

A real-time collaborative whiteboard application powered by Firebase and Firestore.

## Features

- 🎨 Drawing tools (pen, shapes, text, images)
- 👥 Real-time collaboration
- 🔐 Google and Email authentication
- 💾 Auto-save with offline support
- 📱 Responsive design
- 🎯 Multiple canvas sessions per board
- 👀 Live presence indicators
- 📜 Undo/redo history

## Tech Stack

- **Frontend**: React + Vite
- **Canvas**: Fabric.js
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Real-time**: Firestore real-time listeners
- **Hosting**: Can deploy to Netlify, Vercel, or Firebase Hosting

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A Google account (for Firebase)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Follow the setup guide in `SETUP.md` to:
   - Create a Firebase project
   - Enable Authentication and Firestore
   - Get your Firebase configuration
   - Update `.env` file

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open `http://localhost:5173` in your browser

## Project Structure

```
src/
├── components/          # React components
│   ├── Authgate.jsx    # Authentication UI
│   ├── Whiteboard.jsx  # Main canvas component
│   ├── Toolbar.jsx     # Drawing tools
│   ├── SessionManager.jsx  # Canvas sessions
│   └── ...
├── services/
│   ├── firebase.js     # Firebase initialization
│   ├── auth.js         # Authentication functions
│   └── firestore.js    # Database operations
└── App.jsx             # Main app component
```

## Firebase Collections

### boards
Main collection for whiteboard boards
- Stores board metadata, canvas state, and settings
- Subcollections: sessions, presence

### boards/{boardId}/sessions
Canvas sessions within a board
- Each session has its own canvas state
- Subcollection: history (for undo/redo)

### boards/{boardId}/presence
Real-time user presence
- Tracks active users on the board
- Auto-cleanup on disconnect

### users
User profiles
- Synced with Firebase Auth
- Used for collaboration and search

## Deployment

### Firebase Hosting (Recommended)

```bash
npm run build
firebase init hosting
firebase deploy
```

### Netlify

```bash
npm run build
# Deploy the dist/ folder
```

### Vercel

```bash
npm run build
# Deploy the dist/ folder
```

## Security

Firestore security rules are configured to:
- Allow users to read/write their own boards
- Allow collaborators to access shared boards
- Allow public boards to be read by anyone
- Prevent unauthorized access

See `FIREBASE_MIGRATION.md` for the complete security rules.

## Migration from Old Backend

This app was migrated from PostgreSQL + Ably to Firebase. See `MIGRATION_STATUS.md` for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT

## Support

For issues and questions, please open a GitHub issue.
