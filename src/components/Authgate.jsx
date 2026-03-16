import { useState, useEffect, useRef } from 'react'
import { cloneElement } from 'react'
import { signInWithGoogle, signOut, onAuthChange } from '../services/auth'
import { createBoard, getUserBoards, createSession } from '../services/firestore'
import SessionManager from './SessionManager'
import './Authgate.css'

const SESSION_KEY = 'wb_session_v1' // kept for name/email cache only

const getInitials = (name) =>
  name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

const AVATAR_COLORS = [
  ['#667eea', '#764ba2'], ['#f093fb', '#f5576c'], ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'], ['#fa709a', '#fee140'], ['#a18cd1', '#fbc2eb'],
  ['#fccb90', '#d57eeb'], ['#a1c4fd', '#c2e9fb'],
]
const getAvatarColor = (email) => {
  const idx = Array.from(email).reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

export default function AuthGate({ children, theme, boardId, currentSessionId, onSessionChange }) {
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [showProfile, setShowProfile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)
  const profileRef = useRef(null)

  // ── Listen to Firebase auth state changes ─────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || firebaseUser.email,
          photoURL: firebaseUser.photoURL
        })
        
        // Initialize board if needed
        const params = new URLSearchParams(window.location.search)
        const urlBoardId = params.get('board')
        
        if (!urlBoardId) {
          // No board in URL - create or load user's board
          try {
            const boards = await getUserBoards()
            if (boards.length === 0) {
              // Create first board and session
              console.log('[AuthGate] Creating first board for user')
              const newBoard = await createBoard('My Whiteboard')
              const newSession = await createSession(newBoard.id, 'Main Canvas')
              
              // Update URL
              params.set('board', newBoard.id)
              params.set('session', newSession.id)
              window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
              
              if (onSessionChange) {
                onSessionChange(newSession)
              }
            } else {
              // Use existing board
              const board = boards[0]
              params.set('board', board.id)
              window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
            }
          } catch (err) {
            console.error('[AuthGate] Failed to initialize board:', err)
          }
        }
      } else {
        setUser(null)
      }
      setBootstrapping(false)
      setTimeout(() => setMounted(true), 50)
    })

    return unsubscribe
  }, [onSessionChange])

  // ── Close profile dropdown on outside click ───────────────────────────────
  useEffect(() => {
    const handle = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await signOut()
      localStorage.removeItem(SESSION_KEY)
      localStorage.removeItem('wb_canvas_v2')
      localStorage.removeItem('wb_background_v2')
      setUser(null)
      setShowProfile(false)
      setError('')
    } catch (err) {
      console.error('Logout error:', err)
      setError('Failed to sign out')
    }
  }

  // ── Google Sign In ────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    try {
      setError('')
      await signInWithGoogle()
    } catch (err) {
      console.error('Google sign-in error:', err)
      setError(err.message || 'Failed to sign in with Google')
    }
  }

  // ── Loading skeleton while re-hydrating JWT ───────────────────────────────
  if (bootstrapping) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: theme === 'dark' ? '#1e1f20' : '#f5f5f5',
      }}>
        <span style={{ opacity: 0.4, fontSize: 14, color: theme === 'dark' ? '#fff' : '#333' }}>
          Loading…
        </span>
      </div>
    )
  }

  const [grad1, grad2] = user ? getAvatarColor(user.email) : ['#667eea', '#764ba2']

  // ── Authenticated: render topbar + children ───────────────────────────────
  if (user) {
    return (
      <>
        <div className={`ag-topbar ${theme === 'dark' ? 'dark' : ''}`}>
          <div className="ag-topbar-brand">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>Whiteboard</span>
          </div>

          <div className="ag-topbar-right">
            {boardId && (
              <SessionManager
                boardId={boardId}
                currentSessionId={currentSessionId}
                onSessionChange={onSessionChange}
                theme={theme}
                currentUser={user}
              />
            )}

            <div className="ag-avatar-wrap" ref={profileRef}>
              <button
                className="ag-avatar"
                style={{ background: `linear-gradient(135deg, ${grad1}, ${grad2})` }}
                onClick={() => setShowProfile(v => !v)}
                title={user.name}
              >
                {getInitials(user.name)}
              </button>

              {showProfile && (
                <div className="ag-profile-dropdown">
                  <div className="ag-profile-header">
                    <div className="ag-profile-avatar" style={{ background: `linear-gradient(135deg, ${grad1}, ${grad2})` }}>
                      {getInitials(user.name)}
                    </div>
                    <div className="ag-profile-info">
                      <div className="ag-profile-name">{user.name}</div>
                      <div className="ag-profile-email">{user.email}</div>
                    </div>
                  </div>
                  <div className="ag-profile-divider" />
                  <button className="ag-profile-logout" onClick={handleLogout}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="ag-app-wrap">
          {typeof children === 'function' 
            ? children({ user })
            : cloneElement(children, { user, key: user?.id || 'no-user' })
          }
        </div>
      </>
    )
  }

  // ── Unauthenticated: render login / signup card ───────────────────────────
  return (
    <div className={`ag-gate ${mounted ? 'ag-mounted' : ''}`}>
      <div className="ag-bg">
        <div className="ag-bg-blob ag-bg-blob--1" />
        <div className="ag-bg-blob ag-bg-blob--2" />
        <div className="ag-bg-blob ag-bg-blob--3" />
        <div className="ag-grid" />
      </div>

      <div className="ag-card">
        <div className="ag-card-top">
          <div className="ag-logo">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <h1 className="ag-title">Collaborative<br />Whiteboard</h1>
          <p className="ag-sub">Sign in to join the shared space</p>
        </div>

        <div className="ag-form" style={{ marginTop: '24px' }}>
          <button onClick={handleGoogleSignIn} className="ag-oauth-btn ag-oauth-google">
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Sign in with Google
          </button>

          {error && <div className="ag-error">{error}</div>}
        </div>
      </div>
    </div>
  )
}