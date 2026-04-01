import { useState, useEffect } from 'react'
import AuthGate from './components/Authgate'
import Whiteboard from './components/Whiteboard'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import ConfirmDialog from './components/Confirmdialog'
import MermaidModal from './components/MermaidModal'
import './App.css'

function App() {
  console.log('[App] Component render')
  
  const [tool, setTool] = useState(() => localStorage.getItem('wb_tool') || 'select')
  const getSystemTheme = () => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  const resolveTheme = (themeValue) => {
    return themeValue === 'auto' ? getSystemTheme() : themeValue
  }
  
  const [themeSetting, setThemeSetting] = useState(() => localStorage.getItem('wb_theme') || 'light')
  const [theme, setThemeState] = useState(() => resolveTheme(localStorage.getItem('wb_theme') || 'light'))
  
  // Save tool to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('wb_tool', tool)
  }, [tool])
  
  const [color, setColor] = useState(() => {
    const savedTheme = localStorage.getItem('wb_theme') || 'light'
    const actualTheme = resolveTheme(savedTheme)
    return actualTheme === 'dark' ? '#ffffff' : '#000000'
  })
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [canvasRef, setCanvasRef] = useState(null)

  const DARK_DEFAULT_BG = '#1e1f20'
  const LIGHT_DEFAULT_BG = '#ffffff'

  const setTheme = (newThemeSetting) => {
    localStorage.setItem('wb_theme', newThemeSetting)
    setThemeSetting(newThemeSetting)
    
    const actualTheme = resolveTheme(newThemeSetting)
    setThemeState(actualTheme)
    const newBg = actualTheme === 'dark' ? DARK_DEFAULT_BG : LIGHT_DEFAULT_BG
    setCanvasBackground(newBg)
    localStorage.setItem('wb_background_v2', newBg)
    const newColor = actualTheme === 'dark' ? '#ffffff' : '#000000'
    setColor(newColor)
  }
  const [canvasBackground, setCanvasBackground] = useState(() => {
    const saved = localStorage.getItem('wb_background_v2')
    if (saved) return saved
    const savedTheme = localStorage.getItem('wb_theme') || 'light'
    const actualTheme = resolveTheme(savedTheme)
    return actualTheme === 'dark' ? '#1e1f20' : '#ffffff'
  })

  // Called once after loading board data from DB to sync canvas background + UI theme
  const syncBoardAppearance = (loadedBg) => {
    if (!loadedBg) return
    setCanvasBackground(loadedBg)
    localStorage.setItem('wb_background_v2', loadedBg)
    // Detect dark/light from luminance
    const r = parseInt(loadedBg.slice(1, 3), 16) || 0
    const g = parseInt(loadedBg.slice(3, 5), 16) || 0
    const b = parseInt(loadedBg.slice(5, 7), 16) || 0
    const isDark = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
    const newTheme = isDark ? 'dark' : 'light'
    setThemeSetting(newTheme)
    setThemeState(newTheme)
    localStorage.setItem('wb_theme', newTheme)
    setColor(isDark ? '#ffffff' : '#000000')
  }

  const [showSidebar, setShowSidebar] = useState(false)
  const [fillShape, setFillShape] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [boardId, setBoardId] = useState(null)
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [mermaidVisible, setMermaidVisible] = useState(false)
  const [mermaidMode, setMermaidMode] = useState('create')
  const [userRole, setUserRole] = useState('editor')

  const handleRoleChange = (role) => {
    setUserRole(role)
  }
  
  // Sync URL with session changes
  useEffect(() => {
    if (boardId && currentSessionId) {
      const params = new URLSearchParams(window.location.search)
      const urlBoard = params.get('board')
      const urlSession = params.get('session')
      
      // Update URL if it doesn't match current state
      if (urlBoard !== boardId || urlSession !== currentSessionId) {
        params.set('board', boardId)
        params.set('session', currentSessionId)
        const newUrl = `${window.location.pathname}?${params.toString()}`
        window.history.replaceState({}, '', newUrl)
        console.log('[App] Updated URL with session:', currentSessionId)
      }
    }
  }, [boardId, currentSessionId])
  
  useEffect(() => {
    if (themeSetting !== 'auto') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e) => {
      const newTheme = e.matches ? 'dark' : 'light'
      setThemeState(newTheme)
      const newBg = newTheme === 'dark' ? DARK_DEFAULT_BG : LIGHT_DEFAULT_BG
      setCanvasBackground(newBg)
      localStorage.setItem('wb_background_v2', newBg)
      const newColor = newTheme === 'dark' ? '#ffffff' : '#000000'
      setColor(newColor)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [themeSetting])

  const handleHistoryChange = (state) => {
    setCanUndo(state.canUndo)
    setCanRedo(state.canRedo)
  }

  const handleClearRequest = () => {
    setConfirmVisible(true)
  }

  const handleConfirmClear = () => {
    setConfirmVisible(false)
    if (window.__wbClear) {
      window.__wbClear()
    }
  }

  const handleCancelClear = () => {
    setConfirmVisible(false)
  }

  const handleSessionChange = (session) => {
    console.log('[App] ========== SESSION CHANGE ==========')
    console.log('[App] New session:', session.id, session.name)
    console.log('[App] Old session:', currentSessionId)
    console.log('[App] Board ID:', boardId)
    
    setCurrentSessionId(session.id)
    
    // Reload canvas for new session (pass session ID directly)
    if (window.__wbLoadSession) {
      console.log('[App] Calling window.__wbLoadSession with:', session.id)
      window.__wbLoadSession(session.id)
    } else {
      console.error('[App] window.__wbLoadSession is not defined!')
    }
    
    console.log('[App] ========================================')
  }

  const handleShowMermaid = (mode) => {
    setMermaidMode(mode)
    setMermaidVisible(true)
  }

  // Set up global function for Mermaid modal
  useEffect(() => {
    window.__wbShowMermaid = handleShowMermaid
    return () => {
      delete window.__wbShowMermaid
    }
  }, [])

  return (
    <AuthGate 
      theme={theme} 
      boardId={boardId} 
      currentSessionId={currentSessionId} 
      onSessionChange={handleSessionChange}
    >
      {({ user }) => (
      <div className={`app ${theme}`}>
        <Toolbar
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          canvas={canvasRef}
          theme={theme}
          setTheme={setTheme}
          setShowSidebar={setShowSidebar}
          showSidebar={showSidebar}
          fillShape={fillShape}
          setFillShape={setFillShape}
          canUndo={canUndo}
          canRedo={canRedo}
          onClearRequest={handleClearRequest}
          userRole={userRole}
        />
        <div className="main-content">
          {showSidebar && (
            <>
              <div
                className={`sidebar-backdrop ${showSidebar ? 'active' : ''}`}
                onClick={() => setShowSidebar(false)}
              />
              <Sidebar
                theme={themeSetting}
                setTheme={setTheme}
                canvasBackground={canvasBackground}
                setCanvasBackground={setCanvasBackground}
                canvas={canvasRef}
                isOpen={showSidebar}
                onClose={() => setShowSidebar(false)}
              />
            </>
          )}
          <Whiteboard
            tool={tool}
            setTool={setTool}
            color={color}
            strokeWidth={strokeWidth}
            setCanvasRef={setCanvasRef}
            canvasBackground={canvasBackground}
            setCanvasBackground={setCanvasBackground}
            syncBoardAppearance={syncBoardAppearance}
            fillShape={fillShape}
            onHistoryChange={handleHistoryChange}
            theme={theme}
            onBoardIdChange={setBoardId}
            currentSessionId={currentSessionId}
            onSessionIdChange={setCurrentSessionId}
            user={user}
            onRoleChange={handleRoleChange}
          />
        </div>

        <ConfirmDialog
          visible={confirmVisible}
          title="Clear Canvas"
          message="This will erase everything on the canvas."
          confirmLabel="Clear Everything"
          cancelLabel="Keep Working"
          danger={true}
          onConfirm={handleConfirmClear}
          onCancel={handleCancelClear}
        />

        <MermaidModal
          visible={mermaidVisible}
          onClose={() => setMermaidVisible(false)}
          canvas={canvasRef}
          theme={theme}
          mode={mermaidMode}
        />
      </div>
      )}
    </AuthGate>
  )
}

export default App