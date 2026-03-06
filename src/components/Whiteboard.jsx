import { useEffect, useRef, useState, useCallback } from 'react'
import { fabric } from 'fabric'
import ShapeProperties from './ShapeProperties'
import LaserPointer from './Laserpointer'
import './Whiteboard.css'

const SHAPE_TYPES = ['rect', 'circle', 'triangle', 'polygon', 'ellipse', 'group', 'i-text', 'textbox', 'image']
const STORAGE_KEY = 'wb_canvas_v2'
const STORAGE_BG = 'wb_background_v2'
const FONTS = ['DM Sans', 'Arial', 'Georgia', 'Courier New', 'Verdana', 'Times New Roman', 'Trebuchet MS']

const SERIALIZE_PROPS = [
  'stickyText', 'stickyRect', 'selectable', 'evented',
  'perPixelTargetFind', 'strokeUniform', 'hasControls', 'hasBorders',
  'shadow', 'rx', 'ry', 'isEraserStroke', 'isFrame', 'src', 'crossOrigin',
  'isPlaceholder', 'placeholderText',
]

// Container-drag helpers removed intentionally.
// Objects should only move together when explicitly grouped by the user.

const serializeCanvas = (canvas) => {
  try {
    const json = canvas.toJSON(SERIALIZE_PROPS)
    const str = JSON.stringify(json)
    if (str && str.length > 10) {
      localStorage.setItem(STORAGE_KEY, str)
      localStorage.setItem(STORAGE_BG, canvas.backgroundColor || '#ffffff')
    }
  } catch (err) {
    console.warn('[Whiteboard] Save failed:', err)
  }
}

const deserializeCanvas = (canvas, onDone) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const bg = localStorage.getItem(STORAGE_BG)
    if (bg) canvas.setBackgroundColor(bg, () => { })
    if (!raw) { onDone(); return }
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.objects) { onDone(); return }
    canvas.loadFromJSON(parsed, () => {
      canvas.getObjects().forEach(obj => {
        obj.set({ selectable: true, evented: true, objectCaching: true, padding: 10 })
        if (obj.isEraserStroke) obj.set({ selectable: false, evented: false })

        if (obj.type === 'line') {
          obj.set({ perPixelTargetFind: true, hasBorders: false })
          applyLineControls(obj)
        }

        if (obj.stickyText) {
          const txt = canvas.getObjects().find(o => o === obj.stickyText)
          if (txt) {
            obj.on('moving', function () {
              this.stickyText?.set({ left: this.left + 16, top: this.top + 16 })
              this.stickyText?.setCoords()
            })
            obj.on('scaling', function () {
              this.stickyText?.set({ left: this.left + 16, top: this.top + 16 })
              this.stickyText?.setCoords()
            })
            obj.on('rotating', function () {
              this.stickyText?.set({ left: this.left + 16, top: this.top + 16 })
              this.stickyText?.setCoords()
            })
          }
        }

        obj.setCoords()
      })
      canvas.renderAll()
      onDone()
    }, (o, fabricObj) => {
      if (fabricObj) fabricObj.setCoords()
    })
  } catch (err) {
    console.warn('[Whiteboard] Load failed:', err)
    onDone()
  }
}

const CTX_ICONS = {
  front: <><polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" /></>,
  forward: <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="19 12 12 5 5 12" /></>,
  backward: <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="5 12 12 19 19 12" /></>,
  back: <><polyline points="17 6 12 11 7 6" /><polyline points="17 13 12 18 7 13" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  delete: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></>,
  // Group icon: two overlapping rectangles with a bracket
  group: <><rect x="2" y="7" width="9" height="9" rx="1.5" /><rect x="13" y="7" width="9" height="9" rx="1.5" /><path d="M8 4h8" strokeDasharray="2 1" /></>,
  // Ungroup icon: rectangles being separated
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
      actionHandler:   lineActionHandler('p1'),
      render:          renderLineHandle,
      actionName:      'modifyLine',
      cursorStyle:     'crosshair',
    }),
    p2: new fabric.Control({
      positionHandler: linePositionHandler('p2'),
      actionHandler:   lineActionHandler('p2'),
      render:          renderLineHandle,
      actionName:      'modifyLine',
      cursorStyle:     'crosshair',
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
  setCanvasRef, canvasBackground, fillShape, onHistoryChange, theme,
}) => {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const fabricRef = useRef(null)
  const isDrawingRef = useRef(false)
  const startPointRef = useRef(null)
  const currentShapeRef = useRef(null)
  const panActiveRef   = useRef(false)
  const panLastPosRef  = useRef(null)
  const panPointerId   = useRef(null)

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
    const json = canvas.toJSON(SERIALIZE_PROPS)
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1)
    historyRef.current.push(json)
    historyIdxRef.current = historyRef.current.length - 1
    onHistoryChange?.({ canUndo: historyIdxRef.current > 0, canRedo: false })
  }, [onHistoryChange])

  const applySnapshot = useCallback((json) => {
    const canvas = fabricRef.current
    if (!canvas) return
    isMutingRef.current = true
    canvas.loadFromJSON(json, () => {
      canvas.getObjects().forEach(o => {
        o.set({ selectable: true, evented: true })
        if (o.isEraserStroke) o.set({ selectable: false, evented: false })
        if (o.type === 'line') {
          o.set({ perPixelTargetFind: true, hasBorders: false })
          applyLineControls(o)
          delete o.__origStroke
        }
        o.setCoords()
      })
      canvas.renderAll()
      serializeCanvas(canvas)
      isMutingRef.current = false
    })
  }, [])

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return
    historyIdxRef.current -= 1
    applySnapshot(historyRef.current[historyIdxRef.current])
    onHistoryChange?.({ canUndo: historyIdxRef.current > 0, canRedo: historyIdxRef.current < historyRef.current.length - 1 })
  }, [applySnapshot, onHistoryChange])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current += 1
    applySnapshot(historyRef.current[historyIdxRef.current])
    onHistoryChange?.({ canUndo: historyIdxRef.current > 0, canRedo: historyIdxRef.current < historyRef.current.length - 1 })
  }, [applySnapshot, onHistoryChange])

  const clearCanvas = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    isMutingRef.current = true
    canvas.getObjects().forEach(obj => {
      if (obj.stickyText) canvas.remove(obj.stickyText)
      if (obj.stickyRect) canvas.remove(obj.stickyRect)
      canvas.remove(obj)
    })
    isMutingRef.current = false
    canvas.discardActiveObject()
    canvas.fire('object:modified')
    canvas.renderAll()
  }, [])

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
    fabric.Object.prototype.set({
      borderColor: '#1a73e8', borderScaleFactor: 1.5,
      cornerColor: '#ffffff', cornerStrokeColor: '#1a73e8',
      cornerSize: 9, cornerStyle: 'circle',
      transparentCorners: false, borderDashArray: [4, 2], padding: 6,
      hoverCursor: 'move',
      moveCursor: 'move',
    })
    fabricRef.current = canvas
    setCanvasRef(canvas)

    const origTextboxRender = fabric.Textbox.prototype._render
    const origITextRender   = fabric.IText.prototype._render

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

    deserializeCanvas(canvas, () => pushSnapshot())

    const onMutation = () => {
      if (isMutingRef.current || isDrawingRef.current) return
      serializeCanvas(canvas); pushSnapshot()
    }
    canvas.on('object:added', onMutation)
    canvas.on('object:modified', onMutation)
    canvas.on('object:removed', onMutation)

    // Container-drag intentionally removed.
    // Objects only move together when the user explicitly groups them.

    canvas.on('path:created', (opt) => {
      if (toolRef.current === 'eraser')
        opt.path.set({ isEraserStroke: true, selectable: false, evented: false })
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
      if (!obj || (obj.type !== 'i-text' && obj.type !== 'textbox')) {
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
        top:  canvasRect.top  + br.top,
        width:  br.width,
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

    canvas.on('object:moving', (e) => {
      const obj = e.target
      if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
        updateTextBarPos(obj)
      }
      if (obj && obj.stickyText) {
        updateTextBarPos(obj.stickyText)
      }
    })
    canvas.on('object:scaling', (e) => {
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
      if (!target) return  // right-click on empty canvas — no menu

      // canvas.getActiveObject() returns the ActiveSelection when multiple objects
      // are selected. canvas.getActiveObjects() returns the individual objects within it.
      const activeObj = canvas.getActiveObject()
      const activeObjs = canvas.getActiveObjects() // individual objects (unwraps ActiveSelection)

      let finalSelected
      // Check if the right-clicked target is the ActiveSelection itself OR one of its members
      const isInsideMultiSelect =
        activeObjs.length > 1 &&
        (target === activeObj || activeObjs.includes(target))

      if (isInsideMultiSelect) {
        // Preserve the full multi-selection
        finalSelected = [...activeObjs]
      } else {
        // Select only the right-clicked object
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
      panActiveRef.current  = true
      panPointerId.current  = e.pointerId
      panLastPosRef.current = { x: e.clientX, y: e.clientY }
      try { container.setPointerCapture(e.pointerId) } catch (_) {}
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
      panActiveRef.current  = false
      panLastPosRef.current = null
      panPointerId.current  = null
      try { container.releasePointerCapture(e.pointerId) } catch (_) {}
    }
    container.addEventListener('pointerdown',   onPanPointerDown, { passive: false })
    container.addEventListener('pointermove',   onPanPointerMove, { passive: false })
    container.addEventListener('pointerup',     stopPan,          { passive: true })
    container.addEventListener('pointercancel', stopPan,          { passive: true })
    // ──────────────────────────────────────────────────────────────────────

    const resizeObserver = new ResizeObserver((entries) => {
      for (const { contentRect: { width, height } } of entries) {
        canvas.setDimensions({ width, height }); canvas.renderAll()
      }
    })
    resizeObserver.observe(container)
    const onBeforeUnload = () => serializeCanvas(canvas)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      fabric.Textbox.prototype._render = origTextboxRender
      fabric.IText.prototype._render   = origITextRender
      ctxEl?.removeEventListener('contextmenu', handleContextMenu)
      container.removeEventListener('pointerdown',   onPanPointerDown)
      container.removeEventListener('pointermove',   onPanPointerMove)
      container.removeEventListener('pointerup',     stopPan)
      container.removeEventListener('pointercancel', stopPan)
      resizeObserver.disconnect()
      window.removeEventListener('beforeunload', onBeforeUnload)
      canvas.dispose()
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Context menu items ────────────────────────────────────────────────────
  // Group/Ungroup logic:
  //   - "Group Selected" appears ONLY when the user has explicitly selected 2+ objects
  //     (via drag-select or Shift+click). Spatial containment is NEVER considered.
  //   - "Ungroup" appears ONLY when a single fabric.Group is right-clicked.
  //   - Sticky notes (rect+text pairs) are excluded from grouping to preserve their
  //     internal binding logic.
  // ─────────────────────────────────────────────────────────────────────────
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

    // ── Group Selected — only for explicit multi-selections ────────────────
    // Filter out sticky note components (they manage their own internal binding)
    const groupableObjs = (selectedObjects || []).filter(
      o => !o.stickyRect && !o.stickyText
    )

    if (groupableObjs.length >= 2) {
      items.push({
        label: 'Group Selected',
        icon: 'group',
        action: () => {
          // Re-read the live selection at action time (avoids stale closure)
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

    // ── Ungroup — only when a single Group is right-clicked ────────────────
    if (target.type === 'group' && (selectedObjects || []).length === 1) {
      items.push({
        label: 'Ungroup',
        icon: 'ungroup',
        action: () => {
          c.setActiveObject(target)
          const activeGroup = c.getActiveObject()
          if (!activeGroup || activeGroup.type !== 'group') return

          // toActiveSelection() disperses the group back to individual objects
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

    // Add divider before z-order / duplicate / delete if we added group actions
    if (items.length > 0) items.push({ divider: true })

    // ── Standard items ─────────────────────────────────────────────────────
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
          }, ['stickyText', 'stickyRect', 'isPlaceholder', 'placeholderText'])
        }
      },
      { divider: true },
      {
        label: 'Delete', icon: 'delete', danger: true,
        action: () => {
          // Delete ALL explicitly selected objects, not just the right-clicked one
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
    canvas.setBackgroundColor(canvasBackground || '#ffffff', () => {
      canvas.getObjects().forEach(obj => { if (obj.isEraserStroke) obj.set('stroke', canvasBackground) })
      canvas.renderAll()
      localStorage.setItem(STORAGE_BG, canvasBackground)
      serializeCanvas(canvas)
    })
  }, [canvasBackground])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    panActiveRef.current  = false
    panLastPosRef.current = null
    panPointerId.current  = null

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
            stroke: c,
            strokeWidth: sw,
            selectable: false,
            evented: false,
            strokeLineCap: 'round',
            objectCaching: true,
            padding: 10,
            perPixelTargetFind: true,
            hasBorders: false,
            hasControls: false,
            lockScalingX: true,
            lockScalingY: true,
            lockRotation: true,
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
          })
          t.on('changed', function () {
            this.isPlaceholder = (this.text.trim() === '')
            canvas.renderAll()
          })

          canvas.add(t)
          canvas.setActiveObject(t)
          t.enterEditing()
          canvas.renderAll()

          const canvasEl2 = canvas.upperCanvasEl || canvas.lowerCanvasEl
          if (canvasEl2) {
            const canvasRect2 = canvasEl2.getBoundingClientRect()
            const br = t.getBoundingRect(true, true)
            setTextBarPosition({
              left: canvasRect2.left + br.left,
              top:  canvasRect2.top  + br.top,
              width:  br.width,
              height: br.height,
            })
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
          })
          const txt = new fabric.Textbox('', {
            left: ptr.x + 16, top: ptr.y + 16,
            width: W - 32,
            fontSize: 16, fontFamily: "'DM Sans',sans-serif",
            fill: '#333', textAlign: 'left',
            editable: true, selectable: true, evented: true,
            hasControls: false, hasBorders: false,
          })

          txt.isPlaceholder = true
          txt.placeholderText = 'Note…'

          rect.stickyText = txt
          txt.stickyRect = rect

          rect.on('moving',  function () { this.stickyText?.set({ left: this.left + 16, top: this.top + 16 }); this.stickyText?.setCoords() })
          rect.on('scaling', function () { this.stickyText?.set({ left: this.left + 16, top: this.top + 16 }); this.stickyText?.setCoords() })
          rect.on('rotating',function () { this.stickyText?.set({ left: this.left + 16, top: this.top + 16 }); this.stickyText?.setCoords() })

          txt.on('editing:entered', function () { canvas.renderAll() })
          txt.on('editing:exited',  function () { this.isPlaceholder = (this.text.trim() === ''); canvas.renderAll() })
          txt.on('changed',         function () { this.isPlaceholder = (this.text.trim() === ''); canvas.renderAll() })

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

          obj._originalX1 = obj.x1
          obj._originalY1 = obj.y1
          obj._originalX2 = obj.x2
          obj._originalY2 = obj.y2
          obj._lastLeft = obj.left
          obj._lastTop = obj.top

          obj.on('moving', function() {
            const dx = this.left - (this._lastLeft || this.left)
            const dy = this.top - (this._lastTop || this.top)
            this.set({
              x1: this.x1 + dx, y1: this.y1 + dy,
              x2: this.x2 + dx, y2: this.y2 + dy,
            })
            this._lastLeft = this.left
            this._lastTop = this.top
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
      currentShapeRef.current = null
      startPointRef.current = null

      if (wasDrawing) {
        canvas.fire('object:modified')
        const t = toolRef.current
        if (t !== 'select' && t !== 'pen' && t !== 'laser') setTool('select')
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
      setTextBarPosition({
        left: canvasRect.left + br.left,
        top:  canvasRect.top  + br.top,
        width:  br.width,
        height: br.height,
      })
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
            if (cl.type === 'line') {
              cl.set({ perPixelTargetFind: true, hasBorders: false })
              applyLineControls(cl)
            }
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