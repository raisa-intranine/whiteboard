// Firebase Authentication service
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth'
import { auth, googleProvider } from './firebase'
import { updateUserProfile } from './firestore'

/**
 * Sign in with Google
 */
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider)
    const user = result.user
    
    // Update user profile in Firestore
    await updateUserProfile(user.uid, {
      email: user.email,
      name: user.displayName,
      photoURL: user.photoURL,
      createdAt: new Date()
    })
    
    return user
  } catch (error) {
    console.error('Google sign-in error:', error)
    throw error
  }
}

/**
 * Sign in with email and password
 */
export const signInWithEmail = async (email, password) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password)
    return result.user
  } catch (error) {
    console.error('Email sign-in error:', error)
    throw error
  }
}

/**
 * Sign up with email and password
 */
export const signUpWithEmail = async (email, password, name) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    const user = result.user
    
    // Update display name
    await updateProfile(user, { displayName: name })
    
    // Create user profile in Firestore
    await updateUserProfile(user.uid, {
      email: user.email,
      name: name,
      createdAt: new Date()
    })
    
    return user
  } catch (error) {
    console.error('Sign-up error:', error)
    throw error
  }
}

/**
 * Sign out
 */
export const signOut = async () => {
  try {
    await firebaseSignOut(auth)
  } catch (error) {
    console.error('Sign-out error:', error)
    throw error
  }
}

/**
 * Get current user
 */
export const getCurrentUser = () => {
  return auth.currentUser
}

/**
 * Listen to auth state changes
 */
export const onAuthChange = (callback) => {
  return onAuthStateChanged(auth, callback)
}
