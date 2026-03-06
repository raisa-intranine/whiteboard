import { useState, useEffect, useRef } from 'react'
import { signup, login, getMe, setToken, clearToken, getToken } from '../services/api'
import './AuthGate.css'

const SESSION_KEY = 'wb_session_v1' // kept for name/email cache only (no passwords)

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

export default function AuthGate({ children, theme }) {
  const [user, setUser] = useState(null)
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true) // true while re-hydrating session
  const profileRef = useRef(null)

  // ── Re-hydrate session on mount using stored JWT ──────────────────────────
  useEffect(() => {
    const token = getToken()
    if (!token) {
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

  const field = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setError('')
    if (!form.email || !form.password) { setError('Please fill in all fields.'); return }
    setLoading(true)
    try {
      const { token, user: u } = await login({ email: form.email, password: form.password })
      setToken(token)
      localStorage.setItem(SESSION_KEY, JSON.stringify(u))
      setUser(u)
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Signup ────────────────────────────────────────────────────────────────
  const handleSignup = async () => {
    setError('')
    if (!form.name.trim()) { setError('Please enter your name.'); return }
    if (!form.email.includes('@')) { setError('Please enter a valid email.'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      const { token, user: u } = await signup({
        name: form.name.trim(),
        email: form.email,
        password: form.password,
      })
      setToken(token)
      localStorage.setItem(SESSION_KEY, JSON.stringify(u))
      setUser(u)
    } catch (err) {
      setError(err.message || 'Sign up failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    clearToken()
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
    setShowProfile(false)
    setForm({ name: '', email: '', password: '', confirm: '' })
    setMode('login')
  }

  // ── Share board link ──────────────────────────────────────────────────────
  const handleShare = async () => {
    const boardUrl = `${window.location.origin}${window.location.pathname}?board=${user.boardId}`
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
          <p className="ag-sub">A shared space for your ideas</p>
        </div>

        <div className="ag-tabs">
          <button className={`ag-tab${mode === 'login' ? ' active' : ''}`} onClick={() => { setMode('login'); setError('') }}>Sign in</button>
          <button className={`ag-tab${mode === 'signup' ? ' active' : ''}`} onClick={() => { setMode('signup'); setError('') }}>Sign up</button>
          <div className={`ag-tab-indicator ${mode}`} />
        </div>

        <div className="ag-form">
          {mode === 'signup' && (
            <div className="ag-field ag-field--animate">
              <label className="ag-label">Full name</label>
              <input
                className="ag-input"
                type="text"
                placeholder="Your name"
                value={form.name}
                onChange={e => field('name', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSignup()}
                autoFocus
              />
            </div>
          )}

          <div className="ag-field">
            <label className="ag-label">Email</label>
            <input
              className="ag-input"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => field('email', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleSignup())}
              autoFocus={mode === 'login'}
            />
          </div>

          <div className="ag-field">
            <label className="ag-label">Password</label>
            <input
              className="ag-input"
              type="password"
              placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
              value={form.password}
              onChange={e => field('password', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleSignup())}
            />
          </div>

          {mode === 'signup' && (
            <div className="ag-field ag-field--animate">
              <label className="ag-label">Confirm password</label>
              <input
                className="ag-input"
                type="password"
                placeholder="Repeat your password"
                value={form.confirm}
                onChange={e => field('confirm', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSignup()}
              />
            </div>
          )}

          {error && <div className="ag-error">{error}</div>}

          <button
            className={`ag-submit${loading ? ' ag-submit--loading' : ''}`}
            onClick={mode === 'login' ? handleLogin : handleSignup}
            disabled={loading}
          >
            {loading ? (
              <span className="ag-spinner" />
            ) : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </div>

        <p className="ag-switch">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}