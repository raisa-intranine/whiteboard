# Firebase Migration Guide

This document outlines the migration from PostgreSQL + Ably to Firebase/Firestore.

## What Changed

### Before (Old Architecture)
- PostgreSQL database for data storage
- Ably for real-time WebSocket connections
- Express backend server
- Separate authentication with JWT

### After (New Architecture)
- Firestore for data storage and real-time sync
- Firebase Auth for authentication
- No backend server needed
- Built-in offline support

## Setup Instructions

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Follow the setup wizard
4. Enable Google Analytics (optional)

### 2. Enable Firebase Services

#### Enable Authentication:
1. In Firebase Console, go to "Authentication"
2. Click "Get started"
3. Enable "Google" sign-in provider
4. Enable "Email/Password" sign-in provider

#### Enable Firestore:
1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Start in "production mode" (we'll add security rules later)
4. Choose a location close to your users

### 3. Get Firebase Configuration

1. In Firebase Console, go to Project Settings (gear icon)
2. Scroll down to "Your apps"
3. Click the web icon (</>)
4. Register your app
5. Copy the configuration values

### 4. Update Environment Variables

Update your `.env` file with the Firebase configuration:

```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 5. Set Up Firestore Security Rules

In Firebase Console > Firestore Database > Rules, add:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isSignedIn() {
      return request.auth != null;
    }
    
    function isOwner(boardData) {
      return isSignedIn() && request.auth.uid == boardData.ownerId;
    }
    
    function isCollaborator(boardData) {
      return isSignedIn() && request.auth.uid in boardData.collaborators;
    }
    
    function canAccessBoard(boardData) {
      return isOwner(boardData) || isCollaborator(boardData) || boardData.isPublic;
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && request.auth.uid == userId;
    }
    
    // Boards collection
    match /boards/{boardId} {
      allow read: if canAccessBoard(resource.data);
      allow create: if isSignedIn();
      allow update: if isOwner(resource.data) || isCollaborator(resource.data);
      allow delete: if isOwner(resource.data);
      
      // Sessions subcollection
      match /sessions/{sessionId} {
        allow read: if canAccessBoard(get(/databases/$(database)/documents/boards/$(boardId)).data);
        allow write: if canAccessBoard(get(/databases/$(database)/documents/boards/$(boardId)).data);
        
        // History subcollection
        match /history/{historyId} {
          allow read, write: if canAccessBoard(get(/databases/$(database)/documents/boards/$(boardId)).data);
        }
      }
      
      // Presence subcollection
      match /presence/{userId} {
        allow read: if canAccessBoard(get(/databases/$(database)/documents/boards/$(boardId)).data);
        allow write: if isSignedIn() && request.auth.uid == userId;
      }
    }
  }
}
```

## Data Structure

### Boards Collection
```
boards/{boardId}
  - id: string
  - title: string
  - ownerId: string
  - ownerEmail: string
  - ownerName: string
  - collaborators: string[] (user IDs)
  - isPublic: boolean
  - canvasJson: object
  - background: string
  - createdAt: timestamp
  - updatedAt: timestamp
```

### Sessions Subcollection
```
boards/{boardId}/sessions/{sessionId}
  - id: string
  - name: string
  - isPrivate: boolean
  - creatorId: string
  - collaborators: string[]
  - canvasJson: object
  - background: string
  - isActive: boolean
  - createdAt: timestamp
  - updatedAt: timestamp
```

### Presence Subcollection
```
boards/{boardId}/presence/{userId}
  - userId: string
  - name: string
  - email: string
  - isEditing: boolean
  - lastSeen: timestamp
```

## Next Steps

1. Update the Authgate component to use Firebase Auth
2. Update the Whiteboard component to use Firestore real-time listeners
3. Remove old API calls and replace with Firestore operations
4. Test authentication flow
5. Test real-time collaboration
6. Remove backend dependencies (Ably, PostgreSQL)

## Benefits

- No backend server to maintain
- Automatic real-time synchronization
- Built-in offline support
- Simpler deployment
- Better scalability
- Lower costs for small to medium usage
