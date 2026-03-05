import { useState } from 'react'
import AuthGate from './components/AuthGate'
import Whiteboard from './components/Whiteboard'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import ConfirmDialog from './components/Confirmdialog'
import './App.css'

function App() {
  const [tool, setTool] = useState('select')
  const [color, setColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [canvasRef, setCanvasRef] = useState(null)
  const [theme, setTheme] = useState('light')
  const [canvasBackground, setCanvasBackground] = useState(() => {
    return localStorage.getItem('wb_background_v2') || '#ffffff'
  })
  const [showSidebar, setShowSidebar] = useState(false)
  const [fillShape, setFillShape] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)

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
    <AuthGate>
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
                theme={theme}
                setTheme={setTheme}
                canvasBackground={canvasBackground}
                setCanvasBackground={setCanvasBackground}
                canvas={canvasRef}
                isOpen={showSidebar}
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