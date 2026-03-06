import { useState, useRef, useEffect } from 'react'
import './Toolbar.css'

const Icon = ({ children, size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {children}
  </svg>
)

const IC = {
  menu:    <Icon><line x1="4" y1="7"  x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></Icon>,
  select:  <Icon><path d="M5 3l14 9-7 1-3 7L5 3z" strokeWidth="1.9"/></Icon>,
  pan:     <Icon><path d="M18 11V8a2 2 0 0 0-4 0v3"/><path d="M14 10V7a2 2 0 0 0-4 0v3"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M6 14s-2-1-2-4"/><path d="M18 11a2 2 0 0 1 4 0v3a6 6 0 0 1-6 6H9a5 5 0 0 1-5-5v-1"/></Icon>,
  pen:     <Icon><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></Icon>,
  eraser:  <Icon><path d="M21 19H7.5l-5-5 9.5-9.5 9 9z"/><path d="M2.5 19h19"/><path d="M12.5 6.5l5 5"/></Icon>,
  hi:      <Icon><path d="M15.5 2.5l6 6-11 11H4.5v-6.5l11-10.5z"/><path d="M2 22l4-4"/><path d="M9.5 4.5l10 10"/></Icon>,
  line:    <Icon><line x1="5" y1="19" x2="19" y2="5" strokeWidth="2"/><circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="5" r="1.5" fill="currentColor" stroke="none"/></Icon>,
  shapes:  <Icon><rect x="3" y="3" width="8" height="8" rx="1"/><circle cx="17.5" cy="6.5" r="3.5"/><path d="M3 21l4.5-8 4.5 8H3z"/><rect x="13" y="13" width="8" height="8" rx="1"/></Icon>,
  text:    <Icon><path d="M4 6h16M12 6v13M8 19h8" strokeWidth="2"/></Icon>,
  sticky:  <Icon><path d="M5 3h14a2 2 0 0 1 2 2v14l-5 5H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M16 3v5h5"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/></Icon>,
  undo:    <Icon><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></Icon>,
  redo:    <Icon><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></Icon>,
  del:     <Icon><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></Icon>,
  clear:   <Icon><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11l4 6M14 11l-4 6"/></Icon>,
  zoomIn:  <Icon><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></Icon>,
  zoomOut: <Icon><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/><line x1="8" y1="11" x2="14" y2="11"/></Icon>,
  export:  <Icon><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Icon>,
  laser:   <Icon><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.64 5.64l2.12 2.12M16.24 16.24l2.12 2.12M5.64 18.36l2.12-2.12M16.24 7.76l2.12-2.12"/></Icon>,
  frame:   <Icon><rect x="2" y="2" width="20" height="20" rx="3"/><line x1="2" y1="8"  x2="22" y2="8"/><line x1="8" y1="2"  x2="8"  y2="8"/><line x1="16" y1="2" x2="16" y2="8"/></Icon>,
  image:   <Icon><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></Icon>,
  chevron: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
}

const SHAPES = [
  { id: 'rectangle', label: 'Rectangle', icon: <Icon><rect x="3" y="5" width="18" height="14" rx="1.5"/></Icon> },
  { id: 'circle',    label: 'Circle',    icon: <Icon><circle cx="12" cy="12" r="9"/></Icon> },
  { id: 'ellipse',   label: 'Ellipse',   icon: <Icon><ellipse cx="12" cy="12" rx="10" ry="6"/></Icon> },
  { id: 'triangle',  label: 'Triangle',  icon: <Icon><path d="M12 3L2 21h20L12 3z"/></Icon> },
  { id: 'diamond',   label: 'Diamond',   icon: <Icon><path d="M12 2l10 10-10 10L2 12 12 2z"/></Icon> },
  { id: 'star',      label: 'Star',      icon: <Icon><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></Icon> },
  { id: 'hexagon',   label: 'Hexagon',   icon: <Icon><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></Icon> },
  { id: 'arrow',     label: 'Arrow',     icon: <Icon><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></Icon> },
]

const COLORS = [
  '#000000','#1f1f1f','#5f6368','#9aa0a6',
  '#ffffff','#f8f9fa','#fef7e6','#e8f4f8',
  '#ea4335','#ff6d00','#fbbc05','#34a853',
  '#1a73e8','#9c27b0','#e91e63','#00bcd4',
  '#ff8a80','#ffd180','#ccff90','#80d8ff',
]

const SHAPE_IDS = SHAPES.map(s => s.id)

const Toolbar = ({
  tool, setTool, color, setColor,
  strokeWidth, setStrokeWidth,
  canvas, theme, setShowSidebar, showSidebar,
  fillShape, setFillShape,
  canUndo, canRedo,
  onClearRequest,
}) => {
  const [showShapes,  setShowShapes]  = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [zoom,        setZoom]        = useState(100)

  const paletteRef   = useRef(null)
  const shapesRef    = useRef(null)
  const shapesBtnRef = useRef(null)
  const colorBtnRef  = useRef(null)
  const fileInputRef = useRef(null)

  const [shapesMenuPos, setShapesMenuPos] = useState({ top: 0, left: 0 })
  const [palettePos, setPalettePos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    const handler = (e) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target)) setShowPalette(false)
      if (shapesRef.current  && !shapesRef.current.contains(e.target))  setShowShapes(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (showShapes && shapesBtnRef.current) {
      const rect = shapesBtnRef.current.getBoundingClientRect()
      const menuWidth = 164 // min-width of shapes menu
      let left = rect.left
      
      // Prevent overflow on right side
      if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 10
      }
      
      // Prevent overflow on left side
      if (left < 10) {
        left = 10
      }
      
      setShapesMenuPos({
        top: rect.bottom + 10,
        left: left
      })
    }
  }, [showShapes])

  useEffect(() => {
    if (showPalette && colorBtnRef.current) {
      const rect = colorBtnRef.current.getBoundingClientRect()
      const paletteWidth = 160 // min-width of color palette
      let left = rect.left + rect.width / 2
      
      // Prevent overflow on right side
      if (left + paletteWidth / 2 > window.innerWidth) {
        left = window.innerWidth - paletteWidth / 2 - 10
      }
      
      // Prevent overflow on left side
      if (left - paletteWidth / 2 < 10) {
        left = paletteWidth / 2 + 10
      }
      
      setPalettePos({
        top: rect.bottom + 12,
        left: left
      })
    }
  }, [showPalette])

  const handleDelete = () => window.__wbDelete?.()

  const updateZoom = (z) => {
    if (!canvas) return
    canvas.setZoom(z); canvas.renderAll()
    setZoom(Math.round(z * 100))
  }

  const handleExport = () => {
    if (!canvas) return
    const a = document.createElement('a')
    a.download = 'whiteboard.png'
    a.href = canvas.toDataURL({ format: 'png', quality: 1 })
    a.click()
  }

  const handleUndo = () => window.__wbUndo?.()
  const handleRedo = () => window.__wbRedo?.()

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => window.__wbAddImage?.(evt.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const activeShape = SHAPES.find(s => s.id === tool)

  return (
    <div className={`toolbar ${theme}`}>

      <div className="toolbar-left">
        <button className="menu-btn" onClick={() => setShowSidebar(!showSidebar)} data-tooltip="Settings">
          {IC.menu}
        </button>
      </div>

      <div className="toolbar-section">
        <button className={`tool-btn ${tool==='select'      ?'active':''}`} onClick={()=>setTool('select')}      data-tooltip="Select (V)">{IC.select}</button>
        <button className={`tool-btn ${tool==='pan'         ?'active':''}`} onClick={()=>setTool('pan')}         data-tooltip="Hand Pan">{IC.pan}</button>
        <button className={`tool-btn ${tool==='pen'         ?'active':''}`} onClick={()=>setTool('pen')}         data-tooltip="Pen (P)">{IC.pen}</button>
        <button className={`tool-btn ${tool==='highlighter' ?'active':''}`} onClick={()=>setTool('highlighter')} data-tooltip="Highlighter">{IC.hi}</button>
        <button className={`tool-btn ${tool==='eraser'      ?'active':''}`} onClick={()=>setTool('eraser')}      data-tooltip="Eraser (E)">{IC.eraser}</button>
        <button className={`tool-btn ${tool==='line'        ?'active':''}`} onClick={()=>setTool('line')}        data-tooltip="Line (L)">{IC.line}</button>

        <div className="shapes-dropdown" ref={shapesRef}>
          <button
            ref={shapesBtnRef}
            className={`tool-btn shapes-trigger ${SHAPE_IDS.includes(tool)?'active':''}`}
            onClick={() => setShowShapes(v => !v)}
            data-tooltip="Shapes"
          >
            {activeShape ? activeShape.icon : IC.shapes}
            {IC.chevron}
          </button>
          {showShapes && (
            <div className="shapes-menu" style={{ top: `${shapesMenuPos.top}px`, left: `${shapesMenuPos.left}px` }}>
              {SHAPES.map(s => (
                <button key={s.id} className={tool===s.id?'active':''}
                  onClick={() => { setTool(s.id); setShowShapes(false) }}>
                  {s.icon}{s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className={`tool-btn ${tool==='text'  ?'active':''}`} onClick={()=>setTool('text')}   data-tooltip="Text (T)">{IC.text}</button>
        <button className={`tool-btn ${tool==='sticky'?'active':''}`} onClick={()=>setTool('sticky')} data-tooltip="Sticky Note">{IC.sticky}</button>

        <button className="tool-btn" onClick={() => fileInputRef.current?.click()} data-tooltip="Import Image">
          {IC.image}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleImageUpload} />
      </div>

      <div className="toolbar-section">
        <div className="color-palette-wrapper" ref={paletteRef}>
          <button
            ref={colorBtnRef}
            className={`color-display ${showPalette?'open':''}`}
            style={{ backgroundColor: color }}
            onClick={() => setShowPalette(v => !v)}
            aria-label="Pick colour"
          />
          {showPalette && (
            <div className="color-palette" style={{ top: `${palettePos.top}px`, left: `${palettePos.left}px` }}>
              <div className="palette-label">Colour</div>
              <div className="palette-grid">
                {COLORS.map(c => (
                  <button key={c} className={`color-swatch ${color===c?'active':''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => { setColor(c); setShowPalette(false) }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="stroke-width-control">
          <label>Width</label>
          <input type="range" min="1" max="20" value={strokeWidth}
            onChange={e => setStrokeWidth(Number(e.target.value))} />
          <span>{strokeWidth}</span>
        </div>

        <button
          className={`fill-toggle-btn ${fillShape?'on':''}`}
          onClick={() => setFillShape(v => !v)}
          data-tooltip={fillShape ? 'Fill: On' : 'Fill: Off'}
          aria-pressed={fillShape}
        >
          <span className="fill-toggle-btn__track"><span className="fill-toggle-btn__thumb" /></span>
          <span className="fill-toggle-btn__label">Fill</span>
        </button>
      </div>

      <div className="toolbar-section">
        <button className={`tool-btn ${!canUndo?'disabled':''}`} onClick={handleUndo} data-tooltip="Undo (⌘Z)" disabled={!canUndo}>{IC.undo}</button>
        <button className={`tool-btn ${!canRedo?'disabled':''}`} onClick={handleRedo} data-tooltip="Redo (⌘Y)" disabled={!canRedo}>{IC.redo}</button>
      </div>

      <div className="toolbar-section">
        <button className="tool-btn" onClick={handleDelete}   data-tooltip="Delete selected">{IC.del}</button>
        <button className="tool-btn" onClick={onClearRequest} data-tooltip="Clear canvas">{IC.clear}</button>
      </div>

      <div className="toolbar-section">
        <button className="tool-btn" onClick={() => updateZoom((canvas?.getZoom()??1)*0.9)} data-tooltip="Zoom out">{IC.zoomOut}</button>
        <button className="tool-btn zoom-label" onClick={() => updateZoom(1)} data-tooltip="Reset zoom"><span>{zoom}%</span></button>
        <button className="tool-btn" onClick={() => updateZoom((canvas?.getZoom()??1)*1.1)} data-tooltip="Zoom in">{IC.zoomIn}</button>
      </div>

      <div className="toolbar-right">

        {/* Frame tool — sits right before Laser */}
        <button
          className={`tool-btn frame-btn ${tool==='frame'?'active':''}`}
          onClick={() => setTool(tool==='frame'?'select':'frame')}
          data-tooltip="Frame"
          aria-pressed={tool==='frame'}
        >
          {IC.frame}
          <span className="frame-label">Frame</span>
        </button>

        <div className="toolbar-sep" />

        <button
          className={`tool-btn laser-btn ${tool==='laser'?'active laser-on':''}`}
          onClick={() => setTool(tool==='laser'?'select':'laser')}
          data-tooltip="Laser Pointer"
          aria-pressed={tool==='laser'}
        >
          {IC.laser}
          <span className="laser-label">Laser</span>
        </button>

        <div className="toolbar-sep" />

        <button className="tool-btn export-btn" onClick={handleExport} data-tooltip="Export PNG">
          {IC.export}
          <span className="export-label">Export</span>
        </button>
      </div>

    </div>
  )
}

export default Toolbar