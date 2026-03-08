import { useState, useEffect, useRef } from 'react'
import { getMe, setToken, clearToken, getToken, shareBoard } from '../services/api'
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

const API_BASE = import.meta.env.VITE_API_URL || ''

export default function AuthGate({ children, theme }) {
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true) // true while re-hydrating session
  const profileRef = useRef(null)

  // ── Re-hydrate session on mount using token in URL or localStorage ────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    const urlError = params.get('error')
    const urlBoard = params.get('board')

    // If a ?board= is in the URL (user clicked share link), save it so it
    // survives the Google OAuth redirect round-trip.
    if (urlBoard) {
      localStorage.setItem('wb_pending_board', urlBoard)
    }

    // If OAuth just completed (?token=...), restore any pending board param
    if (urlToken) {
      setToken(urlToken)
      // Strip only auth-related params; keep ?board= and any other params intact
      params.delete('token')
      // Restore pending board if not already in params
      const pendingBoard = localStorage.getItem('wb_pending_board')
      if (pendingBoard && !params.get('board')) {
        params.set('board', pendingBoard)
      }
      if (pendingBoard) localStorage.removeItem('wb_pending_board')
      const remaining = params.toString()
      const cleanUrl = window.location.pathname + (remaining ? `?${remaining}` : '')
      window.history.replaceState({}, document.title, cleanUrl)
    } else if (urlError) {
      setError(`Authentication failed: ${urlError.replace(/_/g, ' ')}`)
      params.delete('error')
      const remaining = params.toString()
      const cleanUrl = window.location.pathname + (remaining ? `?${remaining}` : '')
      window.history.replaceState({}, document.title, cleanUrl)
    }

    const currentToken = getToken()
    if (!currentToken) {
      setBootstrapping(false)
      setTimeout(() => setMounted(true), 50)
      return
    }

    getMe()
      .then(u => {
        setUser(u)
        localStorage.setItem(SESSION_KEY, JSON.stringify(u))
      })
      .catch(() => {
        clearToken()
        localStorage.removeItem(SESSION_KEY)
      })
      .finally(() => {
        setBootstrapping(false)
        setTimeout(() => setMounted(true), 50)
      })
  }, [])

  // ── Close profile dropdown on outside click ───────────────────────────────
  useEffect(() => {
    const handle = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    clearToken()
    localStorage.removeItem(SESSION_KEY)
    // Clear canvas data from localStorage to prevent data leakage between users
    localStorage.removeItem('wb_canvas_v2')
    localStorage.removeItem('wb_background_v2')
    setUser(null)
    setShowProfile(false)
    setError('')
  }

  // ── Share board link ──────────────────────────────────────────────────────
  const handleShare = async () => {
    const boardUrl = `${window.location.origin}${window.location.pathname}?board=${user.boardId}`
    try {
      // Mark the board as public on the backend so anyone with the link can access it
      await shareBoard(user.boardId)
    } catch (err) {
      console.warn('[Share] Could not mark board as public:', err.message)
      // Still copy the link even if the API call fails
    }
    try {
      await navigator.clipboard.writeText(boardUrl)
    } catch {
      const el = document.createElement('textarea')
      el.value = boardUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
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
            <button className={`ag-share-btn${copied ? ' copied' : ''}`} onClick={handleShare} title="Copy board link">
              {copied ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  Share Board
                </>
              )}
            </button>

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
          {children}
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

          <a href={`${API_BASE}/api/auth/google`} className="ag-oauth-btn ag-oauth-google" style={{ textDecoration: 'none' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Sign in with Google
          </a>

          {error && <div className="ag-error">{error}</div>}
        </div>
      </div>
    </div>
  )
}