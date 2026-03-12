# Deploy Firestore Security Rules

## Quick Deploy

1. Go to Firebase Console: https://console.firebase.google.com/project/even-affinity-471618-n9/firestore/rules

2. Copy the contents of `firestore.rules` file

3. Paste into the rules editor

4. Click "Publish"

## What These Rules Do

- **Users**: Anyone signed in can read user profiles, but can only edit their own
- **Boards**: 
  - Read: Owner, collaborators, or anyone if public
  - Create: Any signed-in user
  - Update: Owner or collaborators only
  - Delete: Owner only
- **Presence**: Users can only update their own presence
- **Sessions**: Accessible to anyone with board access
- **User History**: Each user can read/write their own undo/redo history
- **Invites**: Only board owner can manage invites

## Testing Rules

After deploying, test by:
1. Creating a board (should work)
2. Sharing with another user (should work)
3. Drawing on canvas (should save)
4. Undo/redo (should work)
5. Refresh page (history should persist)
