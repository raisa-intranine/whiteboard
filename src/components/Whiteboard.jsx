import { useEffect, useRef, useState, useCallback } from 'react'
import { fabric } from 'fabric'
import ShapeProperties from './ShapeProperties'
import LaserPointer from './LaserPointer'
import './Whiteboard.css'

const SHAPE_TYPES = ['rect', 'circle', 'triangle', 'polygon', 'ellipse', 'group', 'i-text', 'textbox', 'image']
const STORAGE_KEY = 'wb_canvas_v2'
const STORAGE_BG  = 'wb_background_v2'

const serializeCanvas = (canvas) => {
  try {
    const json = canvas.toJSON([
      'stickyText','stickyRect',
      'selectable','evented',
      'perPixelTargetFind','strokeUniform',
      'hasControls','hasBorders',
      'shadow','rx','ry',
      'isEraserStroke',
    ])
    localStorage.setItem(STORAGE_KEY, JSON.stringify(json))
    localStorage.setItem(STORAGE_BG, canvas.backgroundColor || '#ffffff')
  } catch (err) {
    console.warn('[Whiteboard] Save failed:', err)
  }
}

const deserializeCanvas = (canvas, onDone) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const bg  = localStorage.getItem(STORAGE_BG)

    if (bg) canvas.setBackgroundColor(bg, () => {})

    if (!raw) { onDone(); return }

    const data = JSON.parse(raw)
    canvas.loadFromJSON(data, () => {
      canvas.getObjects().forEach(obj => {
        obj.set({ selectable: true, evented: true, objectCaching: true, padding: 10 })
        if (obj.isEraserStroke) obj.set({ selectable: false, evented: false })
        obj.setCoords()
      })
      canvas.renderAll()
      onDone()
    })
  } catch (err) {
    console.warn('[Whiteboard] Load failed:', err)
    onDone()
  }
}

const Whiteboard = ({
  tool, setTool, color, strokeWidth,
  setCanvasRef, canvasBackground, fillShape, onHistoryChange,
}) => {
  const containerRef    = useRef(null)
  const canvasRef       = useRef(null)
  const fabricRef       = useRef(null)
  const isDrawingRef    = useRef(false)
  const startPointRef   = useRef(null)
  const currentShapeRef = useRef(null)

  const historyRef    = useRef([])
  const historyIdxRef = useRef(-1)
  const isMutingRef   = useRef(false)

  const [selectedObject, setSelectedObject] = useState(null)

  const fillRef   = useRef(fillShape)
  const colorRef  = useRef(color)
  const strokeRef = useRef(strokeWidth)
  const toolRef   = useRef(tool)

  useEffect(() => { fillRef.current   = fillShape   }, [fillShape])
  useEffect(() => { colorRef.current  = color       }, [color])
  useEffect(() => { strokeRef.current = strokeWidth }, [strokeWidth])
  useEffect(() => { toolRef.current   = tool        }, [tool])

  const pushSnapshot = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas || isMutingRef.current) return
    const json = canvas.toJSON(['shadow','rx','ry','stickyText','stickyRect','isEraserStroke'])
    historyRef.current  = historyRef.current.slice(0, historyIdxRef.current + 1)
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
    onHistoryChange?.({
      canUndo: historyIdxRef.current > 0,
      canRedo: historyIdxRef.current < historyRef.current.length - 1,
    })
  }, [applySnapshot, onHistoryChange])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current += 1
    applySnapshot(historyRef.current[historyIdxRef.current])
    onHistoryChange?.({
      canUndo: historyIdxRef.current > 0,
      canRedo: historyIdxRef.current < historyRef.current.length - 1,
    })
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

  const addImage = useCallback((dataUrl) => {
    const canvas = fabricRef.current
    if (!canvas) return
    fabric.Image.fromURL(dataUrl, (img) => {
      const maxW = canvas.getWidth()  * 0.6
      const maxH = canvas.getHeight() * 0.6
      const scale = Math.min(maxW / img.width, maxH / img.height, 1)
      img.set({
        left:          (canvas.getWidth()  - img.width  * scale) / 2,
        top:           (canvas.getHeight() - img.height * scale) / 2,
        scaleX:        scale,
        scaleY:        scale,
        selectable:    true,
        evented:       true,
        shadow:        new fabric.Shadow({ color: 'rgba(0,0,0,.12)', blur: 12, offsetX: 0, offsetY: 3 }),
      })
      canvas.add(img)
      canvas.setActiveObject(img)
      canvas.renderAll()
    })
  }, [])

  useEffect(() => {
    window.__wbUndo     = undo
    window.__wbRedo     = redo
    window.__wbClear    = clearCanvas
    window.__wbAddImage = addImage
    return () => {
      delete window.__wbUndo
      delete window.__wbRedo
      delete window.__wbClear
      delete window.__wbAddImage
    }
  }, [undo, redo, clearCanvas, addImage])

  useEffect(() => {
    const container = containerRef.current

    const canvas = new fabric.Canvas(canvasRef.current, {
      width:                container.clientWidth,
      height:               container.clientHeight,
      backgroundColor:      canvasBackground || '#ffffff',
      selection:            true,
      selectionColor:       'rgba(26,115,232,0.07)',
      selectionBorderColor: '#1a73e8',
      selectionLineWidth:   1.5,
      selectionDashArray:   [5, 3],
    })

    fabric.Object.prototype.set({
      borderColor:        '#1a73e8',
      borderScaleFactor:  1.5,
      cornerColor:        '#ffffff',
      cornerStrokeColor:  '#1a73e8',
      cornerSize:         9,
      cornerStyle:        'circle',
      transparentCorners: false,
      borderDashArray:    [4, 2],
      padding:            6,
    })

    fabricRef.current = canvas
    setCanvasRef(canvas)

    deserializeCanvas(canvas, () => pushSnapshot())

    const onMutation = () => {
      if (isMutingRef.current || isDrawingRef.current) return
      serializeCanvas(canvas)
      pushSnapshot()
    }

    canvas.on('object:added',    onMutation)
    canvas.on('object:modified', onMutation)
    canvas.on('object:removed',  onMutation)

    canvas.on('path:created', (opt) => {
      if (toolRef.current === 'eraser') {
        opt.path.set({ isEraserStroke: true, selectable: false, evented: false })
      }
    })

    canvas.on('selection:created', (e) => {
      const obj = e.selected?.[0]
      setSelectedObject(obj && SHAPE_TYPES.includes(obj.type) ? obj : null)
    })
    canvas.on('selection:updated', (e) => {
      const obj = e.selected?.[0]
      setSelectedObject(obj && SHAPE_TYPES.includes(obj.type) ? obj : null)
    })
    canvas.on('selection:cleared', () => setSelectedObject(null))

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        canvas.setDimensions({ width, height })
        canvas.renderAll()
      }
    })
    resizeObserver.observe(container)

    const onBeforeUnload = () => serializeCanvas(canvas)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('beforeunload', onBeforeUnload)
      canvas.dispose()
    }
  }, [])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !canvasBackground) return
    canvas.setBackgroundColor(canvasBackground, () => {
      canvas.getObjects().forEach(obj => {
        if (obj.isEraserStroke) obj.set('stroke', canvasBackground)
      })
      canvas.renderAll()
      localStorage.setItem(STORAGE_BG, canvasBackground)
      serializeCanvas(canvas)
    })
  }, [canvasBackground])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    canvas.isDrawingMode = false
    canvas.selection = false

    const hexRgba = (hex, a) => {
      const r = parseInt(hex.slice(1,3), 16)
      const g = parseInt(hex.slice(3,5), 16)
      const b = parseInt(hex.slice(5,7), 16)
      return `rgba(${r},${g},${b},${a})`
    }

    const disableInteraction = (o) => { o.selectable = false; o.evented = false }

    switch (tool) {
      case 'select':
        canvas.selection = true
        canvas.forEachObject(o => {
          if (!o.isEraserStroke) { o.selectable = true; o.evented = true }
        })
        break
      case 'pen':
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        canvas.freeDrawingBrush.color = color
        canvas.freeDrawingBrush.width = strokeWidth
        canvas.freeDrawingBrush.decimate = 2
        break
      case 'eraser':
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        canvas.freeDrawingBrush.color = canvasBackground || '#ffffff'
        canvas.freeDrawingBrush.width = strokeWidth * 5
        break
      case 'highlighter':
        canvas.isDrawingMode = true
        const hb = new fabric.PencilBrush(canvas)
        hb.color = hexRgba(color, 0.3)
        hb.width = strokeWidth * 6
        canvas.freeDrawingBrush = hb
        break
      case 'laser':
        canvas.isDrawingMode = false
        canvas.selection = false
        canvas.forEachObject(disableInteraction)
        break
      default:
        canvas.forEachObject(disableInteraction)
        break
    }
    canvas.renderAll()
  }, [tool, color, strokeWidth, canvasBackground])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const SKIP = ['select','pen','eraser','highlighter','laser']

    const onMouseDown = (opt) => {
      if (SKIP.includes(tool)) return
      isDrawingRef.current = true
      const ptr = canvas.getPointer(opt.e)
      startPointRef.current = ptr

      const c      = colorRef.current
      const sw     = strokeRef.current
      const filled = fillRef.current

      const base = {
        fill:           filled ? c : 'rgba(255,255,255,0.01)',
        stroke:         c,
        strokeWidth:    sw,
        selectable:     false,
        evented:        false,
        objectCaching:  false,
        padding:        10,
        strokeUniform:  true,
        strokeLineCap:  'round',
        strokeLineJoin: 'round',
      }

      let shape = null

      switch (tool) {
        case 'line':
          shape = new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], {
            stroke: c, strokeWidth: sw, selectable: false, evented: false,
            strokeLineCap: 'round', objectCaching: false, padding: 10,
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
          shape = new fabric.Polygon(
            [{ x: 0, y: -50 },{ x: 50, y: 0 },{ x: 0, y: 50 },{ x: -50, y: 0 }],
            { ...base, left: ptr.x, top: ptr.y }
          )
          break
        case 'star': {
          const pts = []
          for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? 50 : 25
            const a = (i * Math.PI) / 5 - Math.PI / 2
            pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) })
          }
          shape = new fabric.Polygon(pts, { ...base, left: ptr.x, top: ptr.y })
          break
        }
        case 'hexagon': {
          const pts = []
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3
            pts.push({ x: 50 * Math.cos(a), y: 50 * Math.sin(a) })
          }
          shape = new fabric.Polygon(pts, { ...base, left: ptr.x, top: ptr.y })
          break
        }
        case 'text': {
          const t = new fabric.IText('Type here…', {
            left: ptr.x, top: ptr.y,
            fill: c, fontSize: 20,
            fontFamily: "'DM Sans',sans-serif",
            selectable: true, evented: true, padding: 10,
          })
          canvas.add(t)
          canvas.setActiveObject(t)
          t.enterEditing()
          canvas.renderAll()
          return
        }
        case 'sticky': {
          const W = 300
          const rect = new fabric.Rect({
            left: ptr.x, top: ptr.y, width: W, height: W,
            fill: '#fff9c4', stroke: '#f9e44f', strokeWidth: 1.5, rx: 8, ry: 8,
            shadow: new fabric.Shadow({ color: 'rgba(0,0,0,.10)', blur: 12, offsetX: 2, offsetY: 4 }),
            selectable: true, evented: true,
          })
          const txt = new fabric.Textbox('Note…', {
            left: ptr.x + 16, top: ptr.y + 16, width: W - 32, fontSize: 16,
            fontFamily: "'DM Sans',sans-serif", fill: '#333', textAlign: 'left',
            editable: true, selectable: true, evented: true,
            hasControls: false, hasBorders: false,
          })
          rect.stickyText = txt
          txt.stickyRect  = rect
          rect.on('moving', function () {
            this.stickyText?.set({ left: this.left + 16, top: this.top + 16 })
            this.stickyText?.setCoords()
          })
          canvas.add(rect)
          canvas.add(txt)
          canvas.setActiveObject(txt)
          setTimeout(() => { txt.enterEditing(); txt.selectAll() }, 100)
          setTimeout(() => setTool('select'), 300)
          canvas.renderAll()
          return
        }
        default: break
      }

      if (shape) { currentShapeRef.current = shape; canvas.add(shape) }
    }

    const onMouseMove = (opt) => {
      if (!isDrawingRef.current || !currentShapeRef.current) return
      const ptr = canvas.getPointer(opt.e)
      const s   = currentShapeRef.current
      const sp  = startPointRef.current

      switch (tool) {
        case 'line': s.set({ x2: ptr.x, y2: ptr.y }); break
        case 'rectangle':
        case 'triangle': {
          const w = ptr.x - sp.x, h = ptr.y - sp.y
          s.set({ width: Math.abs(w), height: Math.abs(h), left: w > 0 ? sp.x : ptr.x, top: h > 0 ? sp.y : ptr.y })
          break
        }
        case 'circle': {
          const r = Math.hypot(ptr.x - sp.x, ptr.y - sp.y) / 2
          s.set({ radius: Math.abs(r) })
          break
        }
        case 'arrow': {
          canvas.remove(s)
          const a = makeArrow(sp.x, sp.y, ptr.x, ptr.y, colorRef.current, strokeRef.current)
          currentShapeRef.current = a
          canvas.add(a)
          break
        }
        case 'diamond':
        case 'star':
        case 'hexagon': {
          const sc = Math.hypot(ptr.x - sp.x, ptr.y - sp.y) / 50
          s.set({ scaleX: sc, scaleY: sc })
          break
        }
        case 'ellipse': {
          const rx = Math.abs(ptr.x - sp.x) / 2
          const ry = Math.abs(ptr.y - sp.y) / 2
          s.set({ rx, ry, left: sp.x + (ptr.x - sp.x) / 2, top: sp.y + (ptr.y - sp.y) / 2 })
          break
        }
        default: break
      }
      canvas.renderAll()
    }

    const onMouseUp = () => {
      if (currentShapeRef.current) {
        const obj = currentShapeRef.current
        obj.set({ selectable: true, evented: true, objectCaching: true })
        obj.setCoords()
        if (obj.type !== 'line' && obj.type !== 'group') {
          obj.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,.08)', blur: 8, offsetX: 0, offsetY: 2 })
        }
      }
      const wasDrawing = isDrawingRef.current
      isDrawingRef.current    = false
      currentShapeRef.current = null
      startPointRef.current   = null
      if (wasDrawing) canvas.fire('object:modified')
    }

    canvas.on('mouse:down', onMouseDown)
    canvas.on('mouse:move', onMouseMove)
    canvas.on('mouse:up',   onMouseUp)

    return () => {
      canvas.off('mouse:down', onMouseDown)
      canvas.off('mouse:move', onMouseMove)
      canvas.off('mouse:up',   onMouseUp)
    }
  }, [tool, setTool])

  const makeArrow = (x1, y1, x2, y2, c, sw) => {
    const angle   = Math.atan2(y2 - y1, x2 - x1)
    const headLen = Math.max(14, sw * 4)
    const line = new fabric.Line([x1, y1, x2, y2], {
      stroke: c, strokeWidth: sw, strokeLineCap: 'round', padding: 10, objectCaching: false,
    })
    const head = new fabric.Triangle({
      left: x2, top: y2, width: headLen, height: headLen, fill: c,
      angle: (angle * 180 / Math.PI) + 90, originX: 'center', originY: 'center', objectCaching: false,
    })
    return new fabric.Group([line, head], { selectable: false, evented: false })
  }

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    canvas.on('mouse:dblclick', (e) => {
      if (e.target?.type === 'textbox' || e.target?.type === 'i-text') {
        e.target.enterEditing(); e.target.selectAll()
      }
    })

    const onKey = (e) => {
      const c = fabricRef.current
      if (!c) return
      const active = c.getActiveObject()
      if (active && (active.type === 'textbox' || active.type === 'i-text') && active.isEditing) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const objs = c.getActiveObjects()
        if (objs.length) {
          isMutingRef.current = true
          objs.forEach(o => {
            if (o.stickyText) c.remove(o.stickyText)
            if (o.stickyRect) c.remove(o.stickyRect)
            c.remove(o)
          })
          isMutingRef.current = false
          c.discardActiveObject()
          c.fire('object:modified')
          c.renderAll()
        }
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c') {
          const obj = c.getActiveObject()
          if (obj) obj.clone(cl => { window._clipboard = cl })
        }
        if (e.key === 'v' && window._clipboard) {
          window._clipboard.clone(cl => {
            c.discardActiveObject()
            cl.set({ left: cl.left + 10, top: cl.top + 10, evented: true })
            if (cl.type === 'activeSelection') {
              cl.canvas = c; cl.forEachObject(o => c.add(o)); cl.setCoords()
            } else { c.add(cl) }
            window._clipboard.top  += 10
            window._clipboard.left += 10
            c.setActiveObject(cl)
            c.requestRenderAll()
          })
        }
        if (e.key === 'z') { e.preventDefault(); undo() }
        if (e.key === 'y') { e.preventDefault(); redo() }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return (
    <div ref={containerRef} className={`whiteboard-container ${tool ? `tool-${tool}` : ''}`}>
      <canvas ref={canvasRef} />
      <LaserPointer active={tool === 'laser'} containerRef={containerRef} />
      <ShapeProperties canvas={fabricRef.current} selectedObject={selectedObject} />
    </div>
  )
}

export default Whiteboard