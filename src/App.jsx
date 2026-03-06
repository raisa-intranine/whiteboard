import { useState, useEffect } from 'react'
import AuthGate from './components/AuthGate'
import Whiteboard from './components/Whiteboard'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import ConfirmDialog from './components/Confirmdialog'
import './App.css'

function App() {
  const [tool, setTool] = useState('select')
  
  // Helper to get system theme preference
  const getSystemTheme = () => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  
  // Helper to resolve actual theme (handles 'auto')
  const resolveTheme = (themeValue) => {
    return themeValue === 'auto' ? getSystemTheme() : themeValue
  }
  
  const [themeSetting, setThemeSetting] = useState(() => localStorage.getItem('wb_theme') || 'light')
  const [theme, setThemeState] = useState(() => resolveTheme(localStorage.getItem('wb_theme') || 'light'))
  
  const [color, setColor] = useState(() => {
    const savedTheme = localStorage.getItem('wb_theme') || 'light'
    const actualTheme = resolveTheme(savedTheme)
    return actualTheme === 'dark' ? '#ffffff' : '#000000'
  })
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [canvasRef, setCanvasRef] = useState(null)

  const DARK_DEFAULT_BG = '#1e1f20'
  const LIGHT_DEFAULT_BG = '#ffffff'

  const setTheme = (newThemeSetting) => {
    localStorage.setItem('wb_theme', newThemeSetting)
    setThemeSetting(newThemeSetting)
    
    const actualTheme = resolveTheme(newThemeSetting)
    setThemeState(actualTheme)
    
    // Auto-switch canvas background to match the new theme default
    const newBg = actualTheme === 'dark' ? DARK_DEFAULT_BG : LIGHT_DEFAULT_BG
    setCanvasBackground(newBg)
    localStorage.setItem('wb_background_v2', newBg)
    
    // Auto-switch color to match the new theme
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
  const [showSidebar, setShowSidebar] = useState(false)
  const [fillShape, setFillShape] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)

  // Listen for system theme changes when 'auto' is selected
  useEffect(() => {
    if (themeSetting !== 'auto') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e) => {
      const newTheme = e.matches ? 'dark' : 'light'
      setThemeState(newTheme)
      
      // Update canvas background
      const newBg = newTheme === 'dark' ? DARK_DEFAULT_BG : LIGHT_DEFAULT_BG
      setCanvasBackground(newBg)
      localStorage.setItem('wb_background_v2', newBg)
      
      // Update color
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

  return (
    <AuthGate theme={theme}>
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
            fillShape={fillShape}
            onHistoryChange={handleHistoryChange}
            theme={theme}
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
      </div>
    </AuthGate>
  )
}

export default App