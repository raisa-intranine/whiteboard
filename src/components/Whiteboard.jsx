import { useEffect, useRef, useState, useCallback } from 'react'
import { fabric } from 'fabric'
import ShapeProperties from './ShapeProperties'
import LaserPointer from './Laserpointer'
import './Whiteboard.css'
import { loadBoard, saveBoard } from '../services/api'
import { initRealtime, publishFullCanvas, publishClear, disconnectRealtime, requestSync } from '../services/realtime'

const SHAPE_TYPES = ['rect', 'circle', 'triangle', 'polygon', 'ellipse', 'group', 'i-text', 'textbox', 'image']
const FONTS = ['DM Sans', 'Arial', 'Georgia', 'Courier New', 'Verdana', 'Times New Roman', 'Trebuchet MS']

const SERIALIZE_PROPS = [
  'selectable', 'evented',
  'perPixelTargetFind', 'strokeUniform', 'hasControls', 'hasBorders',
  'shadow', 'rx', 'ry', 'isEraserStroke', 'isFrame', 'src', 'crossOrigin',
  'isPlaceholder', 'placeholderText', 'editable',
  'isStickyNote', 'isStickyText',
  'fill', 'stroke', 'strokeWidth', 'strokeLineCap', 'opacity',
]

// Debounce helper for throttling backend saves
const debounce = (fn, ms) => {
  let timer = null
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

// Throttle helper for real-time sync (different from debounce - fires at intervals)
const throttle = (fn, ms) => {
  let lastCall = 0
  let timer = null
  return (...args) => {
    const now = Date.now()
    const timeSinceLastCall = now - lastCall
    
    clearTimeout(timer)
    
    if (timeSinceLastCall >= ms) {
      lastCall = now
      fn(...args)
    } else {
      timer = setTimeout(() => {
        lastCall = Date.now()
        fn(...args)
      }, ms - timeSinceLastCall)
    }
  }
}

// Resolve the boardId from URL query param first, then fall back to stored session
const resolveBoardId = () => {
  // Check URL for shared board
  const params = new URLSearchParams(window.location.search)
  const sharedBoardId = params.get('board')
  if (sharedBoardId) return sharedBoardId

  // Fall back to user's own board
  try {
    const session = JSON.parse(localStorage.getItem('wb_session_v1'))
    return session?.boardId || null
  } catch {
    return null
  }
}

// Save canvas to Neon database only
const saveToBoardApi = debounce(async (boardId, canvasJson, background) => {
  try {
    await saveBoard(boardId, { canvasJson, background })
  } catch (err) {
    console.warn('[Whiteboard] Backend save failed:', err.message)
  }
}, 2000)

const serializeCanvas = (canvas) => {
  try {
    const json = canvas.toJSON(SERIALIZE_PROPS)
    const boardId = resolveBoardId()

    if (boardId) {
      // Save to Neon database
      saveToBoardApi(boardId, json, canvas.backgroundColor || '#ffffff')
    } else {
      console.warn('[Whiteboard] No boardId found - user not authenticated')
    }
  } catch (err) {
    console.warn('[Whiteboard] Save failed:', err)
  }
}

// Helper: load JSON into the canvas and restore object state
const loadJsonIntoCanvas = (canvas, parsed, isMutingRef, onDone) => {
  // Check if canvas is still valid (not disposed)
  if (!canvas || !canvas.lowerCanvasEl) {
    if (onDone) onDone()
    return
  }
  // Suppress onMutation firing during load
  if (isMutingRef) isMutingRef.current = true
  canvas.loadFromJSON(parsed, () => {
    const objs = canvas.getObjects()
    // Rebuild sticky note references: identify sticky rects and texts by marker properties
    const textboxes = objs.filter(o => (o.type === 'textbox' || o.type === 'i-text') && o.isStickyText)
    const rects = objs.filter(o => o.type === 'rect' && o.isStickyNote)

    // Rebuild sticky note pairs by checking if textbox is inside/near rect bounds
    rects.forEach(rect => {
      const matchedTxt = textboxes.find(t => {
        const isClose = Math.abs(t.left - (rect.left + 16)) < 5 && Math.abs(t.top - (rect.top + 16)) < 5
        return isClose && !t.stickyRect // not already matched
      })
      if (matchedTxt) {
        rect.stickyText = matchedTxt
        matchedTxt.stickyRect = rect
        // Re-attach event handlers
        rect.on('moving', function () { this.stickyText?.set({ left: this.left + 16, top: this.top + 16 }); this.stickyText?.setCoords() })
        rect.on('scaling', function () { this.stickyText?.set({ left: this.left + 16, top: this.top + 16 }); this.stickyText?.setCoords() })
        rect.on('rotating', function () { this.stickyText?.set({ left: this.left + 16, top: this.top + 16 }); this.stickyText?.setCoords() })
        // When rect finishes moving, ensure text position is finalized and trigger save
        rect.on('modified', function () {
          if (this.stickyText) {
            this.stickyText.set({ left: this.left + 16, top: this.top + 16 })
            this.stickyText.setCoords()
          }
        })
        // Ensure textbox remains editable
        matchedTxt.set({ editable: true, selectable: true, evented: true })
      }
    })

    objs.forEach(obj => {
      obj.set({ selectable: true, evented: true, objectCaching: true, padding: 10 })
      if (obj.isEraserStroke) obj.set({ selectable: false, evented: false })
      
      // Ensure stroke paths have minimum width for visibility
      if (obj.type === 'path' && obj.stroke && obj.strokeWidth < 1) {
        obj.set({ strokeWidth: 1.5 })
      }
      
      if (obj.type === 'line') {
        obj.set({ perPixelTargetFind: true, hasBorders: false })
        applyLineControls(obj)
      }
      obj.setCoords()
    })
    // Check canvas validity before rendering (async callback might run after disposal)
    if (!canvas || !canvas.lowerCanvasEl) {
      console.warn('[loadJsonIntoCanvas] Canvas not available after JSON load')
      if (isMutingRef) isMutingRef.current = false
      onDone()
      return
    }
    console.log('[loadJsonIntoCanvas] Loaded', objs.length, 'objects')
    
    // Debug: Log first few objects to see their properties
    if (objs.length > 0) {
      console.log('[loadJsonIntoCanvas] Sample object:', {
        type: objs[0].type,
        left: objs[0].left,
        top: objs[0].top,
        visible: objs[0].visible,
        opacity: objs[0].opacity,
        stroke: objs[0].stroke,
        fill: objs[0].fill
      })
    }
    
    canvas.requestRenderAll()
    if (isMutingRef) isMutingRef.current = false
    onDone()
  }, (o, fabricObj) => { if (fabricObj) fabricObj.setCoords() })
}

// Load canvas data from Neon database only
const deserializeCanvas = (canvas, isMutingRef, onDone) => {
  const boardId = resolveBoardId()

  if (!boardId) {
    console.warn('[Whiteboard] No boardId found - user not authenticated')
    onDone()
    return
  }

  console.log('[Whiteboard] Loading board from database:', boardId)

  // Load from Neon database with retry logic
  const loadWithRetry = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const data = await loadBoard(boardId)
        return data
      } catch (err) {
        console.warn(`[Whiteboard] Board load attempt ${i + 1}/${retries} failed:`, err.message)
        if (i < retries - 1) {
          // Wait before retrying (exponential backoff: 1s, 2s, 4s)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
        } else {
          throw err
        }
      }
    }
  }

  loadWithRetry()
    .then(({ canvasJson, background }) => {
      console.log('[Whiteboard] Board loaded successfully. Objects count:', canvasJson?.objects?.length || 0, 'Background:', background)
      if (!canvas.lowerCanvasEl) {
        console.warn('[Whiteboard] Canvas disposed during load - skipping')
        onDone()
        return
      }
      if (background) {
        canvas.setBackgroundColor(background, () => {
          canvas.requestRenderAll()
        })
      }
      if (canvasJson && canvasJson.objects && canvasJson.objects.length > 0) {
        console.log('[Whiteboard] Loading', canvasJson.objects.length, 'objects from database')
        loadJsonIntoCanvas(canvas, canvasJson, isMutingRef, () => {
          console.log('[Whiteboard] Canvas load complete, objects on canvas:', canvas.getObjects().length)
          // Force a final render to ensure everything is visible
          if (canvas.lowerCanvasEl) {
            canvas.requestRenderAll()
          }
          onDone()
        })
      } else {
        // No data in backend yet - start with empty canvas
        console.log('[Whiteboard] No canvas data in database - starting with empty canvas')
        onDone()
      }
    })
    .catch(err => {
      console.error('[Whiteboard] Board load failed after retries:', err.message, '- Starting with empty canvas')
      console.log('[Whiteboard] Realtime collaboration will still work for live updates')
      // Start with empty canvas if backend fails - realtime will still work
      // Request sync from other collaborators after a short delay
      onDone({ requestSync: true })
    })
}

const CTX_ICONS = {
  front: <><polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" /></>,
  forward: <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="19 12 12 5 5 12" /></>,
  backward: <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="5 12 12 19 19 12" /></>,
  back: <><polyline points="17 6 12 11 7 6" /><polyline points="17 13 12 18 7 13" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  delete: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></>,
  group: <><rect x="2" y="7" width="9" height="9" rx="1.5" /><rect x="13" y="7" width="9" height="9" rx="1.5" /><path d="M8 4h8" strokeDasharray="2 1" /></>,
  ungroup: <><rect x="2" y="3" width="8" height="8" rx="1.5" /><rect x="14" y="13" width="8" height="8" rx="1.5" /><line x1="10" y1="7" x2="14" y2="17" strokeDasharray="2 2" /></>,
}

const CtxMenu = ({ x, y, items, onClose }) => {
  const ref = useRef(null)
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    const tid = setTimeout(() => {
      document.addEventListener('mousedown', onDown)
      document.addEventListener('keydown', onKey)
    }, 50)
    return () => {
      clearTimeout(tid)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const W = 210
  const estimatedH = items.reduce((h, i) => h + (i.divider ? 9 : 36), 12)
  const safeX = Math.min(x, window.innerWidth - W - 8)
  const safeY = Math.min(y, window.innerHeight - estimatedH - 8)

  return (
    <div
      ref={ref}
      className="wb-ctx-menu"
      style={{ left: safeX, top: safeY }}
      onContextMenu={e => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.divider
          ? <div key={i} className="wb-ctx-divider" />
          : (
            <button
              key={i}
              className={`wb-ctx-item${item.danger ? ' danger' : ''}`}
              onPointerDown={e => e.stopPropagation()}
              onClick={() => { item.action(); onClose() }}
            >
              <svg className="wb-ctx-icon" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round">
                {CTX_ICONS[item.icon]}
              </svg>
              <span>{item.label}</span>
            </button>
          )
      )}
    </div>
  )
}

// ── TextFormatBar — compact floating toolbar above the text object ───────────
const TextFormatBar = ({ format, onChange, position }) => {
  const BAR_HEIGHT = 34
  const BAR_WIDTH = 260
  const MARGIN = 8

  let left = position ? position.left : 0
  let top = position ? position.top - BAR_HEIGHT - MARGIN : 0

  if (left + BAR_WIDTH > window.innerWidth - MARGIN) left = window.innerWidth - BAR_WIDTH - MARGIN
  if (left < MARGIN) left = MARGIN
  if (top < MARGIN && position) top = position.top + position.height + MARGIN

  const barStyle = {
    position: 'fixed', left, top,
    display: 'flex', alignItems: 'center', gap: 2,
    height: 30, padding: '0 6px',
    background: '#fff', border: '1px solid #d1d5db',
    borderRadius: 7, boxShadow: '0 2px 8px rgba(0,0,0,0.13)',
    zIndex: 9999, userSelect: 'none', fontSize: 11,
  }
  const sepStyle = { width: 1, height: 16, background: '#e2e5e9', margin: '0 3px', flexShrink: 0 }
  const btnBase = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: 22, minWidth: 22, padding: '0 4px',
    border: '1px solid transparent', borderRadius: 4,
    background: 'none', cursor: 'pointer', fontSize: 11, color: '#374151',
  }
  const activeBtnStyle = { ...btnBase, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }
  const sizeInputStyle = {
    width: 28, height: 20, textAlign: 'center',
    border: '1px solid #d1d5db', borderRadius: 3,
    fontSize: 11, color: '#374151', background: '#f9fafb',
    outline: 'none', MozAppearance: 'textfield',
  }
  const sizeStepBtn = { ...btnBase, minWidth: 18, height: 18, fontSize: 13, color: '#6b7280', padding: '0 2px' }

  return (
    <div style={barStyle} onMouseDown={e => e.stopPropagation()}>
      <select
        value={format.fontFamily}
        onChange={e => onChange({ fontFamily: e.target.value })}
        style={{
          height: 22, fontSize: 11, border: '1px solid #d1d5db',
          borderRadius: 4, background: '#f9fafb', color: '#374151',
          cursor: 'pointer', outline: 'none', padding: '0 2px',
          fontFamily: format.fontFamily, maxWidth: 100,
        }}
      >
        {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
      </select>

      <div style={sepStyle} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <button style={sizeStepBtn} onClick={() => onChange({ fontSize: Math.max(8, format.fontSize - 1) })}>−</button>
        <input
          style={sizeInputStyle}
          type="number" min="8" max="200" value={format.fontSize}
          onChange={e => { const v = parseInt(e.target.value); if (v >= 8 && v <= 200) onChange({ fontSize: v }) }}
        />
        <button style={sizeStepBtn} onClick={() => onChange({ fontSize: Math.min(200, format.fontSize + 1) })}>+</button>
      </div>

      <div style={sepStyle} />

      <button style={format.bold ? activeBtnStyle : btnBase} onClick={() => onChange({ bold: !format.bold })} title="Bold">
        <strong style={{ fontSize: 12, fontWeight: 700 }}>B</strong>
      </button>

      <button style={format.italic ? activeBtnStyle : btnBase} onClick={() => onChange({ italic: !format.italic })} title="Italic">
        <em style={{ fontSize: 12, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>I</em>
      </button>
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Line endpoint controls ───────────────────────────────────────────────────
const applyLineControls = (line) => {
  const linePositionHandler = (pointKey) => function (_dim, _finalMatrix, fabricObject) {
    const canvas = fabricObject.canvas
    if (!canvas) return new fabric.Point(0, 0)
    const x = pointKey === 'p1' ? fabricObject.x1 : fabricObject.x2
    const y = pointKey === 'p1' ? fabricObject.y1 : fabricObject.y2
    return fabric.util.transformPoint({ x, y }, canvas.viewportTransform)
  }

  const lineActionHandler = (pointKey) => function (_evt, transform, x, y) {
    const fabricObject = transform.target
    const canvas = fabricObject.canvas
    if (!canvas) return false
    const pt = fabric.util.transformPoint(
      { x, y },
      fabric.util.invertTransform(canvas.viewportTransform)
    )
    if (pointKey === 'p1') {
      fabricObject.set({ x1: pt.x, y1: pt.y })
    } else {
      fabricObject.set({ x2: pt.x, y2: pt.y })
    }
    fabricObject.setCoords()
    return true
  }

  const renderLineHandle = (ctx, left, top) => {
    const size = 10
    ctx.save()
    ctx.translate(left, top)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#1a73e8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.rect(-size / 2, -size / 2, size, size)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  line.controls = {
    p1: new fabric.Control({
      positionHandler: linePositionHandler('p1'),
      actionHandler: lineActionHandler('p1'),
      render: renderLineHandle,
      actionName: 'modifyLine',
      cursorStyle: 'crosshair',
    }),
    p2: new fabric.Control({
      positionHandler: linePositionHandler('p2'),
      actionHandler: lineActionHandler('p2'),
      render: renderLineHandle,
      actionName: 'modifyLine',
      cursorStyle: 'crosshair',
    }),
  }
  line.set({ hasControls: true, hasBorders: false })
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Detect whether a canvas background colour is dark ────────────────────────
const isBgDark = (bg) => {
  if (!bg) return false
  const dark = ['#1e1e2e', '#18181b', '#111827', '#0f172a', '#1a1a2e', '#212121', '#1e1e1e']
  if (dark.includes(bg.toLowerCase())) return true
  const m = bg.match(/\d+/g)
  if (m && m.length >= 3) {
    const luminance = +m[0] * 0.299 + +m[1] * 0.587 + +m[2] * 0.114
    return luminance < 128
  }
  if (/^#[0-9a-f]{6}$/i.test(bg)) {
    const r = parseInt(bg.slice(1, 3), 16)
    const g = parseInt(bg.slice(3, 5), 16)
    const b = parseInt(bg.slice(5, 7), 16)
    return r * 0.299 + g * 0.587 + b * 0.114 < 128
  }
  return false
}
// ─────────────────────────────────────────────────────────────────────────────

const drawPlaceholder = (ctx, obj) => {
  const text = obj.placeholderText || 'Type here…'
  const family = (obj.fontFamily || 'DM Sans').replace(/'/g, '').replace(',sans-serif', '').trim()
  const size = obj.fontSize || 20
  const dark = isBgDark(obj.canvas?.backgroundColor)
  ctx.save()
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.28)'
  ctx.font = `${size}px ${family}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const x = -(obj.width / 2)
  const y = -(obj.height / 2) + size * 0.82
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * size * 1.16)
  })
  ctx.restore()
}
// ─────────────────────────────────────────────────────────────────────────────

const Whiteboard = ({
  tool, setTool, color, strokeWidth,
  setCanvasRef, canvasBackground, setCanvasBackground, syncBoardAppearance, fillShape, onHistoryChange, theme,
}) => {
  // Ref to suppress local re-processing of our own realtime echo
  const realtimeIgnoreRef = useRef(false)
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const fabricRef = useRef(null)
  const isDrawingRef = useRef(false)
  const startPointRef = useRef(null)
  const currentShapeRef = useRef(null)
  const panActiveRef = useRef(false)
  const panLastPosRef = useRef(null)
  const panPointerId = useRef(null)
  // True once board data has finished loading from the backend
  const isLoadedRef = useRef(false)
  // Tracks if this mount is still active (handles StrictMode cleanup)
  const mountedRef = useRef(true)
  // Track when we last made a local change (to avoid overwriting with stale DB data)
  const lastLocalChangeRef = useRef(0)
  // Track if user is actively editing text
  const isEditingTextRef = useRef(false)

  const historyRef = useRef([])
  const historyIdxRef = useRef(-1)
  const isMutingRef = useRef(false)

  const [selectedObject, setSelectedObject] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [textFormat, setTextFormat] = useState({ fontSize: 20, fontFamily: 'DM Sans', bold: false, italic: false })
  const [showTextBar, setShowTextBar] = useState(false)
  const [textBarPosition, setTextBarPosition] = useState(null)

  const fillRef = useRef(fillShape)
  const colorRef = useRef(color)
  const strokeRef = useRef(strokeWidth)
  const toolRef = useRef(tool)

  useEffect(() => { fillRef.current = fillShape }, [fillShape])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { strokeRef.current = strokeWidth }, [strokeWidth])
  useEffect(() => { toolRef.current = tool }, [tool])

  const pushSnapshot = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas || isMutingRef.current) return
    // Don't push if canvas is disposed (StrictMode cleanup)
    if (!canvas.lowerCanvasEl || !canvas.wrapperEl) return
    const json = canvas.toJSON(SERIALIZE_PROPS)
    // Avoid duplicate consecutive snapshots (prevents double-click-to-undo issue)
    const prev = historyRef.current[historyIdxRef.current]
    if (prev && JSON.stringify(json) === JSON.stringify(prev)) return
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1)
    historyRef.current.push(json)
    historyIdxRef.current = historyRef.current.length - 1
    onHistoryChange?.({ canUndo: historyIdxRef.current > 0, canRedo: false })
    
    // Save history to localStorage for persistence across refreshes
    const boardId = resolveBoardId()
    if (boardId) {
      try {
        // Keep only last 20 snapshots to avoid localStorage quota issues
        const maxSnapshots = 20
        const startIdx = Math.max(0, historyRef.current.length - maxSnapshots)
        const historyToSave = historyRef.current.slice(startIdx)
        localStorage.setItem(`wb_history_${boardId}`, JSON.stringify(historyToSave))
        localStorage.setItem(`wb_history_idx_${boardId}`, String(historyToSave.length - 1))
      } catch (err) {
        console.warn('[Whiteboard] Failed to save history to localStorage:', err)
      }
    }
  }, [onHistoryChange])

  const applySnapshot = useCallback((json) => {
    const canvas = fabricRef.current
    if (!canvas) return
    if (!json || typeof json !== 'object') {
      console.warn('[Whiteboard] Invalid snapshot data:', json)
      return
    }
    loadJsonIntoCanvas(canvas, json, isMutingRef, () => {
      serializeCanvas(canvas)
    })
  }, [])

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return
    const targetSnapshot = historyRef.current[historyIdxRef.current - 1]
    if (!targetSnapshot) {
      console.warn('[Whiteboard] Undo: target snapshot not found')
      return
    }
    historyIdxRef.current -= 1
    applySnapshot(targetSnapshot)
    onHistoryChange?.({ canUndo: historyIdxRef.current > 0, canRedo: historyIdxRef.current < historyRef.current.length - 1 })
    
    // Save updated index to localStorage
    const boardId = resolveBoardId()
    if (boardId) {
      localStorage.setItem(`wb_history_idx_${boardId}`, String(historyIdxRef.current))
      
      // Broadcast the undo to collaborators
      const canvas = fabricRef.current
      if (canvas) {
        const canvasJson = canvas.toJSON(SERIALIZE_PROPS)
        const background = canvas.backgroundColor || '#ffffff'
        const messageSize = JSON.stringify({ canvasJson, background }).length
        
        if (messageSize < 60000) {
          publishFullCanvas({ type: 'canvas:full', canvasJson, background })
        }
      }
    }
  }, [applySnapshot, onHistoryChange])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    const targetSnapshot = historyRef.current[historyIdxRef.current + 1]
    if (!targetSnapshot) {
      console.warn('[Whiteboard] Redo: target snapshot not found')
      return
    }
    historyIdxRef.current += 1
    applySnapshot(targetSnapshot)
    onHistoryChange?.({ canUndo: historyIdxRef.current > 0, canRedo: historyIdxRef.current < historyRef.current.length - 1 })
    
    // Save updated index to localStorage
    const boardId = resolveBoardId()
    if (boardId) {
      localStorage.setItem(`wb_history_idx_${boardId}`, String(historyIdxRef.current))
      
      // Broadcast the redo to collaborators
      const canvas = fabricRef.current
      if (canvas) {
        const canvasJson = canvas.toJSON(SERIALIZE_PROPS)
        const background = canvas.backgroundColor || '#ffffff'
        const messageSize = JSON.stringify({ canvasJson, background }).length
        
        if (messageSize < 60000) {
          publishFullCanvas({ type: 'canvas:full', canvasJson, background })
        }
      }
    }
  }, [applySnapshot, onHistoryChange])

  const clearCanvas = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    isMutingRef.current = true
    canvas.getObjects().slice().forEach(obj => {
      if (obj.stickyText) canvas.remove(obj.stickyText)
      if (obj.stickyRect) canvas.remove(obj.stickyRect)
      canvas.remove(obj)
    })
    isMutingRef.current = false
    canvas.discardActiveObject()
    canvas.fire('object:modified')
    canvas.renderAll()
    // Reset history
    historyRef.current = []
    historyIdxRef.current = -1
    onHistoryChange?.({ canUndo: false, canRedo: false })
    // Broadcast clear to all collaborators
    const boardId = resolveBoardId()
    if (boardId) {
      publishClear({ type: 'canvas:clear', background: canvas.backgroundColor || '#ffffff' })
      // Clear history from localStorage when clearing canvas
      localStorage.removeItem(`wb_history_${boardId}`)
      localStorage.removeItem(`wb_history_idx_${boardId}`)
    }
    // Also save the cleared state to DB
    serializeCanvas(canvas)
  }, [onHistoryChange])

  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (!objs.length) return
    isMutingRef.current = true
    objs.forEach(o => {
      if (o.stickyText) canvas.remove(o.stickyText)
      if (o.stickyRect) canvas.remove(o.stickyRect)
      canvas.remove(o)
    })
    isMutingRef.current = false
    canvas.discardActiveObject()
    canvas.fire('object:modified')
    canvas.renderAll()
  }, [])

  const addImage = useCallback((dataUrl) => {
    const canvas = fabricRef.current
    if (!canvas) return
    fabric.Image.fromURL(dataUrl, (img) => {
      const maxW = canvas.getWidth() * 0.6
      const maxH = canvas.getHeight() * 0.6
      const scale = Math.min(maxW / img.width, maxH / img.height, 1)
      img.set({
        left: (canvas.getWidth() - img.width * scale) / 2,
        top: (canvas.getHeight() - img.height * scale) / 2,
        scaleX: scale, scaleY: scale,
        selectable: true, evented: true,
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,.12)', blur: 12, offsetX: 0, offsetY: 3 }),
      })
      canvas.add(img)
      canvas.sendToBack(img)
      canvas.setActiveObject(img)
      canvas.renderAll()
    })
  }, [])

  useEffect(() => {
    window.__wbUndo = undo
    window.__wbRedo = redo
    window.__wbClear = clearCanvas
    window.__wbAddImage = addImage
    window.__wbDelete = deleteSelected
    return () => {
      delete window.__wbUndo; delete window.__wbRedo
      delete window.__wbClear; delete window.__wbAddImage; delete window.__wbDelete
    }
  }, [undo, redo, clearCanvas, addImage, deleteSelected])

  useEffect(() => {
    const container = containerRef.current
    // Reset history on mount (handles React StrictMode double-mount)
    historyRef.current = []
    historyIdxRef.current = -1
    isLoadedRef.current = false
    mountedRef.current = true
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: canvasBackground || '#ffffff',
      selection: true,
      selectionColor: 'rgba(26,115,232,0.07)',
      selectionBorderColor: '#1a73e8',
      selectionLineWidth: 1.5,
      selectionDashArray: [5, 3],
      preserveObjectStacking: true,
      defaultCursor: 'default',
      hoverCursor: 'move',
      moveCursor: 'move',
      rotationCursor: 'crosshair',
      allowTouchScrolling: false,
    })

    // Use larger corner handles on touch/coarse-pointer devices for easier grabbing
    const isTouch = window.matchMedia('(pointer: coarse)').matches
    fabric.Object.prototype.set({
      borderColor: '#1a73e8', borderScaleFactor: 1.5,
      cornerColor: '#ffffff', cornerStrokeColor: '#1a73e8',
      cornerSize: isTouch ? 14 : 9, cornerStyle: 'circle',
      transparentCorners: false, borderDashArray: [4, 2],
      padding: isTouch ? 12 : 6,
      hoverCursor: 'move',
      moveCursor: 'move',
    })
    fabricRef.current = canvas
    setCanvasRef(canvas)

    const origTextboxRender = fabric.Textbox.prototype._render
    const origITextRender = fabric.IText.prototype._render

    fabric.Textbox.prototype._render = function (ctx) {
      if (this.isPlaceholder && this.text === '' && !this.isEditing) {
        drawPlaceholder(ctx, this)
      } else {
        origTextboxRender.call(this, ctx)
      }
    }

    fabric.IText.prototype._render = function (ctx) {
      if (this.isPlaceholder && this.text === '' && !this.isEditing) {
        drawPlaceholder(ctx, this)
      } else {
        origITextRender.call(this, ctx)
      }
    }

    // ── Load board data from backend ──────────────────────────────────────
    deserializeCanvas(canvas, isMutingRef, (result) => {
      isLoadedRef.current = true
      
      console.log('[Whiteboard] Canvas loaded. Dimensions:', canvas.getWidth(), 'x', canvas.getHeight(), 'Objects:', canvas.getObjects().length)
      
      // Sync the background AND the UI theme to match what the DB stored
      const loadedBg = canvas.backgroundColor
      if (loadedBg && typeof syncBoardAppearance === 'function') {
        syncBoardAppearance(loadedBg)
      }
      
      // Common variables used throughout
      const bid = resolveBoardId()
      const params = new URLSearchParams(window.location.search)
      const isSharedBoard = params.get('board') !== null
      
      // If database load failed, request sync from collaborators after realtime connects
      if (result && result.requestSync) {
        console.log('[Whiteboard] Will request sync from collaborators')
        setTimeout(() => {
          if (fabricRef.current) {
            console.log('[Whiteboard] Requesting current canvas from other users')
            requestSync()
          }
        }, 1000) // Wait 1 second for realtime to fully connect
      }
      
      // For all boards, poll database as fallback when realtime messages are too large (>60KB)
      // Both sender and receiver need this for large canvases
      if (bid) {
        console.log('[Whiteboard] Setting up database polling (fallback for large canvases)')
        let lastKnownJson = ''
        
        const syncInterval = setInterval(() => {
          if (!mountedRef.current || !fabricRef.current) {
            clearInterval(syncInterval)
            return
          }
          
          // Don't poll while user is actively interacting
          if (isDrawingRef.current || isMutingRef.current || isEditingTextRef.current) return
          
          // Don't poll right after local changes - give time for save to complete
          const timeSinceLastChange = Date.now() - lastLocalChangeRef.current
          if (timeSinceLastChange < 10000) {
            return
          }
          
          loadBoard(bid)
            .then(({ canvasJson, background }) => {
              const currentCanvas = fabricRef.current
              if (!currentCanvas || !currentCanvas.lowerCanvasEl) return
              
              // Don't interrupt active interactions
              if (isDrawingRef.current || isMutingRef.current || isEditingTextRef.current) return
              
              // Compare with last known state to detect actual changes
              const newJson = JSON.stringify(canvasJson)
              if (newJson !== lastKnownJson) {
                lastKnownJson = newJson
                console.log('[Whiteboard] Database has updates. Syncing...')
                realtimeIgnoreRef.current = true
                loadJsonIntoCanvas(currentCanvas, canvasJson, isMutingRef, () => {
                  if (background && currentCanvas.lowerCanvasEl) {
                    currentCanvas.setBackgroundColor(background, () => {
                      currentCanvas.requestRenderAll()
                    })
                  } else {
                    currentCanvas.requestRenderAll()
                  }
                  realtimeIgnoreRef.current = false
                })
              }
            })
            .catch(err => {
              console.debug('[Whiteboard] Database poll failed:', err.message)
            })
        }, 3000) // Poll every 3 seconds
      }
      // Restore viewport transform from localStorage (but NOT for shared boards)
      if (bid && canvas.lowerCanvasEl && canvas.wrapperEl && !isSharedBoard) {
        const savedVpt = localStorage.getItem(`wb_viewport_${bid}`)
        if (savedVpt) {
          try {
            const vpt = JSON.parse(savedVpt)
            // Validate viewport transform array before applying
            if (Array.isArray(vpt) && vpt.length === 6) {
              console.log('[Whiteboard] Restoring saved viewport for own board')
              canvas.setViewportTransform(vpt)
              canvas.renderAll()
            }
          } catch (err) {
            console.warn('[Whiteboard] Failed to restore viewport transform:', err)
          }
        }
      }
      
      // Restore undo/redo history from localStorage
      let historyRestored = false
      if (bid) {
        try {
          const savedHistory = localStorage.getItem(`wb_history_${bid}`)
          const savedIdx = localStorage.getItem(`wb_history_idx_${bid}`)
          if (savedHistory) {
            const parsed = JSON.parse(savedHistory)
            if (Array.isArray(parsed) && parsed.length > 0) {
              historyRef.current = parsed
              historyIdxRef.current = savedIdx ? parseInt(savedIdx, 10) : parsed.length - 1
              
              // Ensure index is within bounds
              if (historyIdxRef.current < 0) historyIdxRef.current = 0
              if (historyIdxRef.current >= parsed.length) historyIdxRef.current = parsed.length - 1
              
              // Update button states
              onHistoryChange?.({
                canUndo: historyIdxRef.current > 0,
                canRedo: historyIdxRef.current < parsed.length - 1
              })
              
              historyRestored = true
              console.log(`[Whiteboard] Restored ${parsed.length} snapshots, index: ${historyIdxRef.current}`)
            }
          }
        } catch (err) {
          console.warn('[Whiteboard] Failed to restore history:', err)
        }
      }
      
      // If no history was restored, create initial snapshot immediately
      // This ensures we can undo back to the initial loaded state
      if (!historyRestored && canvas && canvas.lowerCanvasEl) {
        // Create initial snapshot synchronously to ensure it happens before any user interaction
        try {
          const json = JSON.stringify(canvas.toJSON(SERIALIZE_PROPS))
          historyRef.current = [json]
          historyIdxRef.current = 0
          
          // Save to localStorage
          if (bid) {
            localStorage.setItem(`wb_history_${bid}`, JSON.stringify([json]))
            localStorage.setItem(`wb_history_idx_${bid}`, '0')
          }
          
          // Update button states
          onHistoryChange?.({ canUndo: false, canRedo: false })
          console.log('[Whiteboard] Created initial snapshot')
        } catch (err) {
          console.warn('[Whiteboard] Failed to create initial snapshot:', err)
        }
      }
      
      // Auto-center viewport on content for shared boards
      // If there are objects on the canvas, center the viewport so User 2 can see what's there
      const objects = canvas.getObjects()
      console.log('[Whiteboard] After load - objects on canvas:', objects.length, 'Is shared board:', isSharedBoard)
      
      if (bid && objects.length > 0 && isSharedBoard) {
        console.log('[Whiteboard] Auto-centering viewport on content for shared board')
        // Calculate bounding box of all objects
        const allCoords = []
        objects.forEach(obj => {
          const bounds = obj.getBoundingRect()
          allCoords.push({ x: bounds.left, y: bounds.top })
          allCoords.push({ x: bounds.left + bounds.width, y: bounds.top + bounds.height })
        })
        
        if (allCoords.length > 0) {
          const minX = Math.min(...allCoords.map(c => c.x))
          const maxX = Math.max(...allCoords.map(c => c.x))
          const minY = Math.min(...allCoords.map(c => c.y))
          const maxY = Math.max(...allCoords.map(c => c.y))
          
          console.log('[Whiteboard] Content bounds:', { minX, maxX, minY, maxY })
          
          const contentWidth = Math.max(maxX - minX, 1)
          const contentHeight = Math.max(maxY - minY, 1)
          const contentCenterX = minX + contentWidth / 2
          const contentCenterY = minY + contentHeight / 2
          
          const canvasWidth = canvas.getWidth()
          const canvasHeight = canvas.getHeight()
          
          console.log('[Whiteboard] Content size:', contentWidth, 'x', contentHeight, 'Canvas:', canvasWidth, 'x', canvasHeight)
          
          // Calculate zoom to fit content with some padding
          // Constrain zoom between 0.1 (10%) and 2 (200%)
          let zoom = Math.min(
            (canvasWidth * 0.8) / contentWidth,
            (canvasHeight * 0.8) / contentHeight
          )
          zoom = Math.max(0.1, Math.min(2, zoom)) // Clamp between 0.1 and 2
          
          console.log('[Whiteboard] Calculated zoom:', zoom)
          
          // Center the viewport on the content
          const vpt = canvas.viewportTransform
          vpt[0] = zoom
          vpt[3] = zoom
          vpt[4] = canvasWidth / 2 - contentCenterX * zoom
          vpt[5] = canvasHeight / 2 - contentCenterY * zoom
          
          console.log('[Whiteboard] Setting viewport transform:', vpt)
          
          canvas.setViewportTransform(vpt)
          canvas.requestRenderAll()
          
          console.log('[Whiteboard] Auto-centered viewport. Zoom:', zoom, 'Center:', contentCenterX, contentCenterY)
        } else {
          console.warn('[Whiteboard] No coordinates found for auto-centering')
          canvas.requestRenderAll()
        }
      } else if (!isSharedBoard) {
        // For own boards (not shared), viewport was already restored from localStorage above
        console.log('[Whiteboard] Using own board viewport')
        canvas.requestRenderAll()
      }
      
      // Final render to ensure everything is visible
      setTimeout(() => {
        if (canvas && canvas.lowerCanvasEl) {
          console.log('[Whiteboard] Final render check - objects:', canvas.getObjects().length)
          canvas.requestRenderAll()
        }
      }, 100)
    })

    // ── Initialize Ably realtime collaboration ────────────────────────────
    const boardId = resolveBoardId()
    
    // Throttled function to broadcast full canvas state
    const broadcastCanvas = throttle(() => {
      if (!boardId || realtimeIgnoreRef.current) return
      const canvasJson = canvas.toJSON(SERIALIZE_PROPS)
      const background = canvas.backgroundColor || '#ffffff'
      
      // Check message size before broadcasting (Ably limit: 65KB)
      const messageSize = JSON.stringify({ canvasJson, background }).length
      const MAX_MESSAGE_SIZE = 60000 // 60KB to be safe
      
      if (messageSize > MAX_MESSAGE_SIZE) {
        console.warn('[Whiteboard] Canvas too large for realtime broadcast:', messageSize, 'bytes. Using database sync only.')
        // Don't broadcast, just save to database (already happening via serializeCanvas)
        return
      }
      
      console.log('[Whiteboard] Broadcasting canvas update to collaborators (', messageSize, 'bytes)')
      publishFullCanvas({
        type: 'canvas:full',
        canvasJson,
        background
      })
    }, 1000) // Increased throttle to 1 second to reduce message frequency

    if (boardId) {
      initRealtime(boardId, (msg) => {
        // Received a message from another collaborator
        if (!msg) return
        
        console.log('[Whiteboard] Received realtime message:', msg.type)
        
        // Use fabricRef.current instead of closure canvas variable
        const currentCanvas = fabricRef.current
        
        // Ensure canvas exists before processing
        if (!currentCanvas) {
          console.warn('[Whiteboard] Ignoring realtime message - canvas not available')
          return
        }

        realtimeIgnoreRef.current = true

        // Handle clear canvas broadcast
        if (msg.type === 'canvas:clear') {
          console.log('[Whiteboard] Processing canvas clear from collaborator')
          const bg = msg.background || '#ffffff'
          isMutingRef.current = true
          currentCanvas.getObjects().slice().forEach(o => currentCanvas.remove(o))
          currentCanvas.setBackgroundColor(bg, () => {
            if (currentCanvas.lowerCanvasEl) currentCanvas.renderAll()
          })
          isMutingRef.current = false
          realtimeIgnoreRef.current = false
          return
        }

        // Handle full canvas sync
        if (msg.type === 'canvas:full' && msg.canvasJson) {
          console.log('[Whiteboard] Applying canvas update from collaborator, objects count:', msg.canvasJson.objects?.length || 0)
          const bgToApply = msg.background
          loadJsonIntoCanvas(currentCanvas, msg.canvasJson, isMutingRef, () => {
            if (bgToApply && currentCanvas.lowerCanvasEl) {
              currentCanvas.setBackgroundColor(bgToApply, () => {
                if (currentCanvas.lowerCanvasEl) {
                  currentCanvas.requestRenderAll()
                  // Force another render after a short delay to ensure visibility
                  setTimeout(() => {
                    if (currentCanvas.lowerCanvasEl) currentCanvas.requestRenderAll()
                  }, 50)
                }
              })
            } else if (currentCanvas.lowerCanvasEl) {
              currentCanvas.requestRenderAll()
              // Force another render after a short delay to ensure visibility
              setTimeout(() => {
                if (currentCanvas.lowerCanvasEl) currentCanvas.requestRenderAll()
              }, 50)
            }
            console.log('[Whiteboard] Canvas update applied successfully. Objects on canvas:', currentCanvas.getObjects().length)
            console.log('[Whiteboard] Canvas dimensions:', currentCanvas.getWidth(), 'x', currentCanvas.getHeight())
            realtimeIgnoreRef.current = false
          })
          return
        }

        // Handle sync request from a new collaborator
        if (msg.type === 'sync:request') {
          console.log('[Whiteboard] Received sync request - broadcasting current canvas')
          // Send our current canvas state to help the requester
          const currentCanvas = fabricRef.current
          if (currentCanvas && currentCanvas.lowerCanvasEl) {
            const canvasJson = currentCanvas.toJSON(SERIALIZE_PROPS)
            const background = currentCanvas.backgroundColor || '#ffffff'
            publishFullCanvas({
              type: 'canvas:full',
              canvasJson,
              background
            })
          }
          realtimeIgnoreRef.current = false
          return
        }

        realtimeIgnoreRef.current = false
      }).catch(err => console.warn('[Whiteboard] Realtime init failed:', err.message))
    }

    // ── Canvas mutation handler: save + broadcast ─────────────────────────
    const onMutation = () => {
      // Don't create history entries until initial load is complete
      if (!isLoadedRef.current) return
      if (isMutingRef.current || isDrawingRef.current || realtimeIgnoreRef.current) return
      
      // Track that we made a local change
      lastLocalChangeRef.current = Date.now()
      
      serializeCanvas(canvas)
      pushSnapshot()
      // Broadcast full canvas to collaborators
      broadcastCanvas()
    }
    
    canvas.on('object:added', onMutation)
    canvas.on('object:modified', onMutation)
    canvas.on('object:removed', onMutation)
    canvas.on('path:created', (opt) => {
      if (toolRef.current === 'eraser')
        opt.path.set({ isEraserStroke: true, selectable: false, evented: false })
      onMutation()
    })

    const syncTextBar = (obj) => {
      if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
        setTextFormat({
          fontSize: obj.fontSize || 20,
          fontFamily: (obj.fontFamily || 'DM Sans').replace(/'/g, '').replace(',sans-serif', '').trim(),
          bold: obj.fontWeight === 'bold',
          italic: obj.fontStyle === 'italic',
        })
        setShowTextBar(true)
      } else {
        setShowTextBar(false)
        setTextBarPosition(null)
      }
    }

    const LINE_SELECT_COLOR = '#1a73e8'

    const highlightLines = (selected = []) => {
      canvas.getObjects().forEach(obj => {
        if (obj.type === 'line' && obj.__origStroke !== undefined) {
          obj.set('stroke', obj.__origStroke)
          delete obj.__origStroke
        }
      })
      selected.forEach(obj => {
        if (obj.type === 'line') {
          obj.__origStroke = obj.stroke
          obj.set('stroke', LINE_SELECT_COLOR)
        }
      })
      canvas.renderAll()
    }

    const updateTextBarPos = (obj) => {
      if (!obj || (obj.type !== 'i-text' && obj.type !== 'textbox') || typeof obj.getBoundingRect !== 'function') {
        setTextBarPosition(null)
        return
      }
      const canvasEl = canvas.upperCanvasEl || canvas.lowerCanvasEl
      const canvasRect = canvasEl
        ? canvasEl.getBoundingClientRect()
        : container.getBoundingClientRect()
      const br = obj.getBoundingRect(true, true)
      setTextBarPosition({
        left: canvasRect.left + br.left,
        top: canvasRect.top + br.top,
        width: br.width,
        height: br.height,
      })
    }

    canvas.on('selection:created', (e) => {
      const o = e.selected?.[0]
      setSelectedObject(o && SHAPE_TYPES.includes(o.type) ? o : null)
      syncTextBar(o)
      updateTextBarPos(o)
      highlightLines(e.selected || [])
    })
    canvas.on('selection:updated', (e) => {
      const o = e.selected?.[0]
      setSelectedObject(o && SHAPE_TYPES.includes(o.type) ? o : null)
      syncTextBar(o)
      updateTextBarPos(o)
      highlightLines(e.selected || [])
    })
    canvas.on('selection:cleared', () => {
      setSelectedObject(null)
      setShowTextBar(false)
      setTextBarPosition(null)
      highlightLines([])
    })

    // Track when user is editing text to prevent database polling from interrupting
    canvas.on('text:editing:entered', () => {
      console.log('[Whiteboard] Text editing started - pausing database sync')
      isEditingTextRef.current = true
      lastLocalChangeRef.current = Date.now()
    })
    canvas.on('text:editing:exited', () => {
      console.log('[Whiteboard] Text editing finished - resuming database sync')
      isEditingTextRef.current = false
      lastLocalChangeRef.current = Date.now()
    })

    canvas.on('object:moving', (e) => {
      // Track movement to prevent database polling during drag
      lastLocalChangeRef.current = Date.now()
      
      const obj = e.target
      if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
        updateTextBarPos(obj)
      }
      if (obj && obj.stickyText && typeof obj.stickyText.getBoundingRect === 'function') {
        updateTextBarPos(obj.stickyText)
      }
    })
    canvas.on('object:scaling', (e) => {
      // Track scaling to prevent database polling during scale
      lastLocalChangeRef.current = Date.now()
      
      const obj = e.target
      if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
        updateTextBarPos(obj)
      }
    })

    const upperCanvas = canvas.upperCanvasEl ?? canvas.wrapperEl?.querySelector('canvas.upper-canvas')
    const handleContextMenu = (e) => {
      e.preventDefault()
      e.stopPropagation()

      const target = canvas.findTarget(e, false)
      if (!target) return

      const activeObj = canvas.getActiveObject()
      const activeObjs = canvas.getActiveObjects()

      let finalSelected
      const isInsideMultiSelect =
        activeObjs.length > 1 &&
        (target === activeObj || activeObjs.includes(target))

      if (isInsideMultiSelect) {
        finalSelected = [...activeObjs]
      } else {
        canvas.discardActiveObject()
        canvas.setActiveObject(target)
        canvas.renderAll()
        finalSelected = [target]
      }

      setContextMenu({
        clientX: e.clientX,
        clientY: e.clientY,
        target: finalSelected[0],
        selectedObjects: finalSelected,
      })
    }
    const ctxEl = upperCanvas || canvas.wrapperEl
    ctxEl?.addEventListener('contextmenu', handleContextMenu)

    // ── Unified pointer-event pan ─────────────────────────────────────────
    const onPanPointerDown = (e) => {
      if (toolRef.current !== 'pan') return
      if (panActiveRef.current) return
      panActiveRef.current = true
      panPointerId.current = e.pointerId
      panLastPosRef.current = { x: e.clientX, y: e.clientY }
      try { container.setPointerCapture(e.pointerId) } catch (_) { }
      e.preventDefault()
      e.stopPropagation()
    }
    const onPanPointerMove = (e) => {
      if (!panActiveRef.current) return
      if (e.pointerId !== panPointerId.current) return
      const dx = e.clientX - panLastPosRef.current.x
      const dy = e.clientY - panLastPosRef.current.y
      panLastPosRef.current = { x: e.clientX, y: e.clientY }
      const vpt = canvas.viewportTransform.slice()
      vpt[4] += dx; vpt[5] += dy
      canvas.setViewportTransform(vpt)
      canvas.renderAll()
      e.preventDefault()
      e.stopPropagation()
    }
    const stopPan = (e) => {
      if (!panActiveRef.current) return
      if (e.pointerId !== panPointerId.current) return
      panActiveRef.current = false
      panLastPosRef.current = null
      panPointerId.current = null
      try { container.releasePointerCapture(e.pointerId) } catch (_) { }
    }
    container.addEventListener('pointerdown', onPanPointerDown, { passive: false })
    container.addEventListener('pointermove', onPanPointerMove, { passive: false })
    container.addEventListener('pointerup', stopPan, { passive: true })
    container.addEventListener('pointercancel', stopPan, { passive: true })
    // ──────────────────────────────────────────────────────────────────────

    const resizeObserver = new ResizeObserver((entries) => {
      for (const { contentRect: { width, height } } of entries) {
        if (width === 0 || height === 0) continue
        canvas.setDimensions({ width, height })
        canvas.renderAll()
      }
    })
    resizeObserver.observe(container)

    // ── Mouse wheel: scroll to pan, ctrl+wheel to zoom ────────────────────
    const onWheel = (e) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // Zoom around cursor position
        let zoom = canvas.getZoom()
        zoom *= 0.999 ** e.deltaY
        zoom = Math.min(Math.max(0.1, zoom), 20)
        canvas.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom)
      } else {
        // Pan / scroll
        const vpt = canvas.viewportTransform.slice()
        vpt[4] -= e.deltaX
        vpt[5] -= e.deltaY
        canvas.setViewportTransform(vpt)
      }
      // Save viewport transform to localStorage
      const bid = resolveBoardId()
      if (bid) {
        localStorage.setItem(`wb_viewport_${bid}`, JSON.stringify(canvas.viewportTransform))
      }
      canvas.renderAll()
    }
    container.addEventListener('wheel', onWheel, { passive: false })

    const onBeforeUnload = () => {
      // Use fetch with keepalive for guaranteed delivery on page close
      const bid = resolveBoardId()
      if (bid) {
        const json = canvas.toJSON(SERIALIZE_PROPS)
        const background = canvas.backgroundColor || '#ffffff'
        const BASE_URL = import.meta.env.VITE_API_URL || ''
        const token = localStorage.getItem('wb_jwt')
        fetch(`${BASE_URL}/api/boards/${bid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ canvasJson: json, background }),
          keepalive: true,
        }).catch(() => {})
      }
      disconnectRealtime()
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      mountedRef.current = false
      disconnectRealtime() // Disconnect Ably to prevent callback after unmount
      fabric.Textbox.prototype._render = origTextboxRender
      fabric.IText.prototype._render = origITextRender
      ctxEl?.removeEventListener('contextmenu', handleContextMenu)
      container.removeEventListener('pointerdown', onPanPointerDown)
      container.removeEventListener('pointermove', onPanPointerMove)
      container.removeEventListener('pointerup', stopPan)
      container.removeEventListener('pointercancel', stopPan)
      container.removeEventListener('wheel', onWheel)
      resizeObserver.disconnect()
      window.removeEventListener('beforeunload', onBeforeUnload)
      canvas.dispose()
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Context menu items ────────────────────────────────────────────────────
  const ctxItems = useCallback((target, selectedObjects) => {
    const c = fabricRef.current
    if (!c || !target) return []
    const snap = () => { serializeCanvas(c); pushSnapshot() }

    const reorderAndSnap = (moveFn) => {
      moveFn()
      c.discardActiveObject()
      c.renderAll()
      requestAnimationFrame(() => {
        c.setActiveObject(target)
        target.setCoords()
        c.renderAll()
        snap()
      })
    }

    const items = []

    const groupableObjs = (selectedObjects || []).filter(
      o => !o.stickyRect && !o.stickyText
    )

    if (groupableObjs.length >= 2) {
      items.push({
        label: 'Group Selected',
        icon: 'group',
        action: () => {
          const liveObjs = c.getActiveObjects().filter(o => !o.stickyRect && !o.stickyText)
          const toGroup = liveObjs.length >= 2 ? liveObjs : groupableObjs
          c.discardActiveObject()
          const sel = new fabric.ActiveSelection(toGroup, { canvas: c })
          c.setActiveObject(sel)
          const group = sel.toGroup()
          group.set({ selectable: true, evented: true })
          group.setCoords()
          c.setActiveObject(group)
          c.renderAll()
          snap()
        },
      })
    }

    if (target.type === 'group' && (selectedObjects || []).length === 1) {
      items.push({
        label: 'Ungroup',
        icon: 'ungroup',
        action: () => {
          c.setActiveObject(target)
          const activeGroup = c.getActiveObject()
          if (!activeGroup || activeGroup.type !== 'group') return
          const ungrouped = activeGroup.toActiveSelection()
          ungrouped.getObjects().forEach(o => {
            o.set({ selectable: true, evented: true })
            o.setCoords()
          })
          c.discardActiveObject()
          c.renderAll()
          snap()
        },
      })
    }

    if (items.length > 0) items.push({ divider: true })

    items.push(
      { label: 'Bring Forward', icon: 'forward', action: () => reorderAndSnap(() => c.bringForward(target)) },
      { label: 'Send Backward', icon: 'backward', action: () => reorderAndSnap(() => c.sendBackwards(target)) },
      { divider: true },
      {
        label: 'Duplicate', icon: 'copy',
        action: () => {
          target.clone((cl) => {
            cl.set({ left: target.left + 16, top: target.top + 16, selectable: true, evented: true })
            if (cl.type === 'line') {
              cl.set({ perPixelTargetFind: true, hasBorders: false })
              applyLineControls(cl)
            }
            c.add(cl)
            c.setActiveObject(cl)
            snap()
          }, ['isPlaceholder', 'placeholderText', 'isStickyNote', 'isStickyText'])
        }
      },
      { divider: true },
      {
        label: 'Delete', icon: 'delete', danger: true,
        action: () => {
          const toDelete = selectedObjects && selectedObjects.length > 1
            ? selectedObjects
            : [target]
          toDelete.forEach(o => {
            if (o.stickyText) c.remove(o.stickyText)
            if (o.stickyRect) c.remove(o.stickyRect)
            c.remove(o)
          })
          c.discardActiveObject()
          snap()
        }
      },
    )

    return items
  }, [pushSnapshot])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    if (!canvas.lowerCanvasEl || !canvas.wrapperEl) return
    canvas.setBackgroundColor(canvasBackground || '#ffffff', () => {
      if (!canvas.lowerCanvasEl || !canvas.wrapperEl) return
      canvas.getObjects().forEach(obj => { if (obj.isEraserStroke) obj.set('stroke', canvasBackground) })
      canvas.renderAll()
      localStorage.setItem('wb_background_v2', canvasBackground)
      // Only save back to DB if the board is fully loaded (avoid overwriting DB data on initial sync)
      if (isLoadedRef.current) serializeCanvas(canvas)
    })
  }, [canvasBackground])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    panActiveRef.current = false
    panLastPosRef.current = null
    panPointerId.current = null

    isDrawingRef.current = false
    if (currentShapeRef.current) {
      canvas.remove(currentShapeRef.current)
      currentShapeRef.current = null
    }
    startPointRef.current = null

    canvas.isDrawingMode = false

    const hexRgba = (hex, a) => {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
      return `rgba(${r},${g},${b},${a})`
    }

    const disableAll = (o) => { o.selectable = false; o.evented = false }
    const enableAll = (o) => {
      if (!o.isEraserStroke) { o.selectable = true; o.evented = true }
    }

    const setCursorAll = (cur) => {
      canvas.defaultCursor = cur
      canvas.hoverCursor = cur
      if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = cur
      if (canvas.lowerCanvasEl) canvas.lowerCanvasEl.style.cursor = cur
      canvas.setCursor(cur)
    }

    switch (tool) {
      case 'select':
        canvas.selection = true
        canvas.forEachObject(enableAll)
        canvas.hoverCursor = 'move'
        canvas.moveCursor = 'move'
        setCursorAll('default')
        break
      case 'pan':
        canvas.selection = false
        canvas.forEachObject(disableAll)
        canvas.moveCursor = 'grabbing'
        setCursorAll('grab')
        break
      case 'pen':
        canvas.selection = false
        canvas.forEachObject(disableAll)
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        canvas.freeDrawingBrush.color = color
        canvas.freeDrawingBrush.width = strokeWidth
        canvas.freeDrawingBrush.decimate = 2
        setCursorAll('crosshair')
        break
      case 'eraser':
        canvas.selection = false
        canvas.forEachObject(disableAll)
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        canvas.freeDrawingBrush.color = canvasBackground || '#ffffff'
        canvas.freeDrawingBrush.width = strokeWidth * 5
        setCursorAll('crosshair')
        break
      case 'highlighter': {
        canvas.selection = false
        canvas.forEachObject(disableAll)
        canvas.isDrawingMode = true
        const hb = new fabric.PencilBrush(canvas)
        hb.color = hexRgba(color, 0.3); hb.width = strokeWidth * 6
        canvas.freeDrawingBrush = hb
        setCursorAll('crosshair')
        break
      }
      case 'laser':
      case 'frame':
        canvas.isDrawingMode = false
        canvas.selection = false
        canvas.forEachObject(disableAll)
        setCursorAll('crosshair')
        break
      case 'text':
        canvas.isDrawingMode = false
        canvas.selection = false
        canvas.forEachObject(disableAll)
        setCursorAll('text')
        break
      case 'sticky':
        canvas.isDrawingMode = false
        canvas.selection = false
        canvas.forEachObject(disableAll)
        setCursorAll('crosshair')
        break
      default:
        canvas.selection = false
        canvas.forEachObject(disableAll)
        setCursorAll('crosshair')
        break
    }

    canvas.renderAll()
  }, [tool, color, strokeWidth, canvasBackground])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const DRAW_SKIP = ['select', 'pan', 'pen', 'eraser', 'highlighter', 'laser']

    const onMouseDown = (opt) => {
      if (opt.e.button === 2) return

      const currentTool = toolRef.current
      if (currentTool === 'pan') return

      if (currentTool === 'frame') {
        isDrawingRef.current = true
        const ptr = canvas.getPointer(opt.e)
        startPointRef.current = ptr
        const frame = new fabric.Rect({
          left: ptr.x, top: ptr.y, width: 1, height: 1,
          fill: 'rgba(240,244,255,0.5)',
          stroke: '#1a73e8', strokeWidth: 2,
          strokeDashArray: [7, 4],
          rx: 6, ry: 6,
          selectable: false, evented: false, objectCaching: false,
          isFrame: true,
        })
        currentShapeRef.current = frame
        canvas.add(frame)
        canvas.sendToBack(frame)
        return
      }

      if (DRAW_SKIP.includes(currentTool)) return

      isDrawingRef.current = true
      const ptr = canvas.getPointer(opt.e)
      startPointRef.current = ptr

      const c = colorRef.current
      const sw = strokeRef.current
      const filled = fillRef.current
      const base = {
        fill: filled ? c : 'rgba(255,255,255,0.01)',
        stroke: c, strokeWidth: sw,
        selectable: false, evented: false, objectCaching: false,
        padding: 10, strokeUniform: true, strokeLineCap: 'round', strokeLineJoin: 'round',
      }

      let shape = null
      switch (currentTool) {
        case 'line':
          shape = new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], {
            stroke: c, strokeWidth: sw, selectable: false, evented: false,
            strokeLineCap: 'round', objectCaching: true, padding: 10,
            perPixelTargetFind: true, hasBorders: false, hasControls: false,
            lockScalingX: true, lockScalingY: true, lockRotation: true,
          })
          break
        case 'rectangle':
          shape = new fabric.Rect({ ...base, left: ptr.x, top: ptr.y, width: 0, height: 0, rx: 2, ry: 2 })
          break
        case 'circle':
          shape = new fabric.Circle({ ...base, left: ptr.x, top: ptr.y, radius: 0 })
          break
        case 'triangle':
          shape = new fabric.Triangle({ ...base, left: ptr.x, top: ptr.y, width: 0, height: 0 })
          break
        case 'ellipse':
          shape = new fabric.Ellipse({ ...base, left: ptr.x, top: ptr.y, rx: 0, ry: 0 })
          break
        case 'arrow':
          shape = makeArrow(ptr.x, ptr.y, ptr.x, ptr.y, c, sw)
          break
        case 'diamond':
          shape = new fabric.Polygon([{ x: 0, y: -50 }, { x: 50, y: 0 }, { x: 0, y: 50 }, { x: -50, y: 0 }], { ...base, left: ptr.x, top: ptr.y })
          break
        case 'star': {
          const pts = []
          for (let i = 0; i < 10; i++) { const r = i % 2 === 0 ? 50 : 25, a = (i * Math.PI) / 5 - Math.PI / 2; pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) }) }
          shape = new fabric.Polygon(pts, { ...base, left: ptr.x, top: ptr.y })
          break
        }
        case 'hexagon': {
          const pts = []
          for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; pts.push({ x: 50 * Math.cos(a), y: 50 * Math.sin(a) }) }
          shape = new fabric.Polygon(pts, { ...base, left: ptr.x, top: ptr.y })
          break
        }
        case 'text': {
          const PLACEHOLDER = 'Type here…'
          const t = new fabric.Textbox('', {
            left: ptr.x, top: ptr.y, width: 160,
            fill: c, fontSize: 20,
            fontFamily: "'DM Sans',sans-serif",
            selectable: true, evented: true,
            padding: 10, editable: true, splitByGrapheme: false,
          })
          t.isPlaceholder = true
          t.placeholderText = PLACEHOLDER
          t.on('editing:entered', function () { canvas.renderAll() })
          t.on('editing:exited', function () { 
            this.isPlaceholder = (this.text.trim() === '')
            canvas.renderAll()
            // Fire object:modified to trigger save and broadcast
            canvas.fire('object:modified', { target: this })
          })
          t.on('changed', function () { this.isPlaceholder = (this.text.trim() === ''); canvas.renderAll() })
          canvas.add(t)
          canvas.setActiveObject(t)
          t.enterEditing()
          canvas.renderAll()
          const canvasEl2 = canvas.upperCanvasEl || canvas.lowerCanvasEl
          if (canvasEl2) {
            const canvasRect2 = canvasEl2.getBoundingClientRect()
            const br = t.getBoundingRect(true, true)
            setTextBarPosition({ left: canvasRect2.left + br.left, top: canvasRect2.top + br.top, width: br.width, height: br.height })
          }
          setShowTextBar(true)
          canvas.defaultCursor = 'default'
          canvas.hoverCursor = 'move'
          canvas.moveCursor = 'move'
          canvas.selection = true
          canvas.forEachObject(o => { if (!o.isEraserStroke) { o.selectable = true; o.evented = true } })
          if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = 'default'
          setTool('select')
          return
        }
        case 'sticky': {
          const W = 300
          const rect = new fabric.Rect({
            left: ptr.x, top: ptr.y, width: W, height: W,
            fill: '#fff9c4', stroke: '#f9e44f', strokeWidth: 1.5,
            rx: 8, ry: 8,
            shadow: new fabric.Shadow({ color: 'rgba(0,0,0,.10)', blur: 12, offsetX: 2, offsetY: 4 }),
            selectable: true, evented: true,
            isStickyNote: true, // Marker for identifying after deserialization
          })
          const txt = new fabric.Textbox('', {
            left: ptr.x + 16, top: ptr.y + 16, width: W - 32,
            fontSize: 16, fontFamily: "'DM Sans',sans-serif",
            fill: '#333', textAlign: 'left',
            editable: true, selectable: true, evented: true,
            hasControls: false, hasBorders: false,
            isStickyText: true, // Marker for identifying after deserialization
          })
          txt.isPlaceholder = true
          txt.placeholderText = 'Note…'
          rect.stickyText = txt
          txt.stickyRect = rect
          rect.on('moving', function () { this.stickyText?.set({ left: this.left + 16, top: this.top + 16 }); this.stickyText?.setCoords() })
          rect.on('scaling', function () { this.stickyText?.set({ left: this.left + 16, top: this.top + 16 }); this.stickyText?.setCoords() })
          rect.on('rotating', function () { this.stickyText?.set({ left: this.left + 16, top: this.top + 16 }); this.stickyText?.setCoords() })
          // When rect finishes moving, ensure text position is finalized
          rect.on('modified', function () {
            if (this.stickyText) {
              this.stickyText.set({ left: this.left + 16, top: this.top + 16 })
              this.stickyText.setCoords()
            }
          })
          txt.on('editing:entered', function () { canvas.renderAll() })
          txt.on('editing:exited', function () { 
            this.isPlaceholder = (this.text.trim() === '')
            canvas.renderAll()
            // Fire object:modified to trigger save and broadcast
            canvas.fire('object:modified', { target: this })
          })
          txt.on('changed', function () { this.isPlaceholder = (this.text.trim() === ''); canvas.renderAll() })
          canvas.add(rect)
          canvas.add(txt)
          canvas.setActiveObject(txt)
          setTimeout(() => { txt.enterEditing() }, 100)
          canvas.defaultCursor = 'default'
          canvas.hoverCursor = 'move'
          canvas.moveCursor = 'move'
          canvas.selection = true
          canvas.forEachObject(o => { if (!o.isEraserStroke) { o.selectable = true; o.evented = true } })
          if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = 'default'
          canvas.renderAll()
          setTool('select')
          return
        }
        default: break
      }
      if (shape) { currentShapeRef.current = shape; canvas.add(shape) }
    }

    const onMouseMove = (opt) => {
      if (toolRef.current === 'pan') return
      if (!isDrawingRef.current || !currentShapeRef.current) return
      const ptr = canvas.getPointer(opt.e)
      const s = currentShapeRef.current
      const sp = startPointRef.current
      const currentTool = toolRef.current

      if (currentTool === 'frame') {
        const w = ptr.x - sp.x, h = ptr.y - sp.y
        s.set({ width: Math.abs(w), height: Math.abs(h), left: w > 0 ? sp.x : ptr.x, top: h > 0 ? sp.y : ptr.y })
        canvas.renderAll(); return
      }

      switch (currentTool) {
        case 'line': s.set({ x2: ptr.x, y2: ptr.y }); break
        case 'rectangle': case 'triangle': {
          const w = ptr.x - sp.x, h = ptr.y - sp.y
          s.set({ width: Math.abs(w), height: Math.abs(h), left: w > 0 ? sp.x : ptr.x, top: h > 0 ? sp.y : ptr.y })
          break
        }
        case 'circle': s.set({ radius: Math.abs(Math.hypot(ptr.x - sp.x, ptr.y - sp.y) / 2) }); break
        case 'arrow': {
          canvas.remove(s)
          currentShapeRef.current = makeArrow(sp.x, sp.y, ptr.x, ptr.y, colorRef.current, strokeRef.current)
          canvas.add(currentShapeRef.current)
          break
        }
        case 'diamond': case 'star': case 'hexagon': {
          const sc = Math.hypot(ptr.x - sp.x, ptr.y - sp.y) / 50
          s.set({ scaleX: sc, scaleY: sc }); break
        }
        case 'ellipse': {
          const rx = Math.abs(ptr.x - sp.x) / 2, ry = Math.abs(ptr.y - sp.y) / 2
          s.set({ rx, ry, left: sp.x + (ptr.x - sp.x) / 2, top: sp.y + (ptr.y - sp.y) / 2 }); break
        }
        default: break
      }
      canvas.renderAll()
    }

    const onMouseUp = (opt) => {
      if (toolRef.current === 'pan') return

      if (currentShapeRef.current) {
        const obj = currentShapeRef.current
        if (obj.isFrame) {
          obj.set({ selectable: true, evented: true, objectCaching: true }); obj.setCoords()
          canvas.sendToBack(obj)
        } else if (obj.type === 'line') {
          obj.set({
            selectable: true, evented: true, objectCaching: true,
            perPixelTargetFind: true, hasBorders: false,
            lockScalingX: true, lockScalingY: true, lockRotation: true,
          })
          obj._originalX1 = obj.x1; obj._originalY1 = obj.y1
          obj._originalX2 = obj.x2; obj._originalY2 = obj.y2
          obj._lastLeft = obj.left; obj._lastTop = obj.top
          obj.on('moving', function () {
            const dx = this.left - (this._lastLeft || this.left)
            const dy = this.top - (this._lastTop || this.top)
            this.set({ x1: this.x1 + dx, y1: this.y1 + dy, x2: this.x2 + dx, y2: this.y2 + dy })
            this._lastLeft = this.left; this._lastTop = this.top
            this.setCoords()
          })
          applyLineControls(obj)
          obj.setCoords()
        } else {
          obj.set({ selectable: true, evented: true, objectCaching: true }); obj.setCoords()
          if (obj.type !== 'line' && obj.type !== 'group')
            obj.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,.08)', blur: 8, offsetX: 0, offsetY: 2 })
        }
      }

      const wasDrawing = isDrawingRef.current
      isDrawingRef.current = false
      const finishedShape = currentShapeRef.current
      currentShapeRef.current = null
      startPointRef.current = null

      if (wasDrawing) {
        canvas.fire('object:modified')
        const t = toolRef.current
        if (t !== 'select' && t !== 'pen' && t !== 'laser') setTool('select')

        // Broadcast the newly-drawn shape to collaborators.
        // We do this here (instead of relying on object:added/object:modified)
        // because those events fire while isDrawingRef.current is still true
        // (the shape is still being stretched) so the onMutation guard blocks them.
        if (!realtimeIgnoreRef.current && finishedShape) {
          const currentBoardId = resolveBoardId()
          if (currentBoardId) {
            console.log('[Whiteboard] Broadcasting newly drawn shape to collaborators')
            publishFullCanvas({ type: 'canvas:full', canvasJson: canvas.toJSON(SERIALIZE_PROPS), background: canvas.backgroundColor || '#ffffff' })
          }
        }
      }
    }

    canvas.on('mouse:down', onMouseDown)
    canvas.on('mouse:move', onMouseMove)
    canvas.on('mouse:up', onMouseUp)
    return () => {
      canvas.off('mouse:down', onMouseDown)
      canvas.off('mouse:move', onMouseMove)
      canvas.off('mouse:up', onMouseUp)
    }
  }, [tool, setTool])  // eslint-disable-line react-hooks/exhaustive-deps

  const makeArrow = (x1, y1, x2, y2, c, sw) => {
    const angle = Math.atan2(y2 - y1, x2 - x1), headLen = Math.max(14, sw * 4)
    const line = new fabric.Line([x1, y1, x2, y2], { stroke: c, strokeWidth: sw, strokeLineCap: 'round', padding: 10, objectCaching: false })
    const head = new fabric.Triangle({ left: x2, top: y2, width: headLen, height: headLen, fill: c, angle: (angle * 180 / Math.PI) + 90, originX: 'center', originY: 'center', objectCaching: false })
    return new fabric.Group([line, head], { selectable: false, evented: false })
  }

  const applyTextFormat = useCallback((changes) => {
    const canvas = fabricRef.current
    if (!canvas) return
    const obj = canvas.getActiveObject()
    if (!obj || (obj.type !== 'i-text' && obj.type !== 'textbox')) return
    const next = { ...textFormat, ...changes }
    obj.set({
      fontSize: next.fontSize,
      fontFamily: `'${next.fontFamily}',sans-serif`,
      fontWeight: next.bold ? 'bold' : 'normal',
      fontStyle: next.italic ? 'italic' : 'normal',
    })
    canvas.renderAll()
    const canvasEl = fabricRef.current?.upperCanvasEl || fabricRef.current?.lowerCanvasEl
    if (canvasEl) {
      const canvasRect = canvasEl.getBoundingClientRect()
      const br = obj.getBoundingRect(true, true)
      setTextBarPosition({ left: canvasRect.left + br.left, top: canvasRect.top + br.top, width: br.width, height: br.height })
    }
    setTextFormat(next)
    serializeCanvas(canvas)
    pushSnapshot()
  }, [textFormat, pushSnapshot])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.on('mouse:dblclick', (e) => {
      if (e.target?.type === 'textbox' || e.target?.type === 'i-text') {
        e.target.enterEditing()
        e.target.selectAll()
      }
    })
    const onKey = (e) => {
      const c = fabricRef.current; if (!c) return
      const active = c.getActiveObject()
      if (active && (active.type === 'textbox' || active.type === 'i-text') && active.isEditing) return
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected() }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c') { const o = c.getActiveObject(); if (o) o.clone(cl => { window._clipboard = cl }) }
        if (e.key === 'v' && window._clipboard) {
          window._clipboard.clone(cl => {
            c.discardActiveObject()
            cl.set({ left: cl.left + 10, top: cl.top + 10, evented: true })
            if (cl.type === 'line') { cl.set({ perPixelTargetFind: true, hasBorders: false }); applyLineControls(cl) }
            if (cl.type === 'activeSelection') { cl.canvas = c; cl.forEachObject(o => c.add(o)); cl.setCoords() } else { c.add(cl) }
            window._clipboard.top += 10; window._clipboard.left += 10
            c.setActiveObject(cl); c.requestRenderAll()
          })
        }
        if (e.key === 'z') { e.preventDefault(); undo() }
        if (e.key === 'y') { e.preventDefault(); redo() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, deleteSelected])

  return (
    <div
      ref={containerRef}
      className={`whiteboard-container ${tool ? `tool-${tool}` : ''} ${theme === 'dark' ? 'dark' : ''}`}
      style={{ touchAction: tool === 'pan' ? 'none' : 'auto', userSelect: 'none' }}
    >
      <canvas ref={canvasRef} />
      <LaserPointer active={tool === 'laser'} containerRef={containerRef} />
      <ShapeProperties canvas={fabricRef.current} selectedObject={selectedObject} />

      {showTextBar && (
        <TextFormatBar
          format={textFormat}
          onChange={applyTextFormat}
          position={textBarPosition}
        />
      )}

      {contextMenu && (
        <CtxMenu
          x={contextMenu.clientX}
          y={contextMenu.clientY}
          items={ctxItems(contextMenu.target, contextMenu.selectedObjects)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

export default Whiteboard