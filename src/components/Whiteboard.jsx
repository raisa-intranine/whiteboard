import { useEffect, useRef, useState, useCallback } from 'react'
import { fabric } from 'fabric'
import ShapeProperties from './ShapeProperties'
import LaserPointer from './Laserpointer'
import './Whiteboard.css'

const SHAPE_TYPES = ['rect', 'circle', 'triangle', 'polygon', 'ellipse', 'group', 'i-text', 'textbox', 'image']
const STORAGE_KEY = 'wb_canvas_v2'
const STORAGE_BG  = 'wb_background_v2'
const FONTS = ['DM Sans', 'Arial', 'Georgia', 'Courier New', 'Verdana', 'Times New Roman', 'Trebuchet MS']

const SERIALIZE_PROPS = [
  'stickyText','stickyRect','selectable','evented',
  'perPixelTargetFind','strokeUniform','hasControls','hasBorders',
  'shadow','rx','ry','isEraserStroke','isFrame','src','crossOrigin',
]

const serializeCanvas = (canvas) => {
  try {
    const json = canvas.toJSON(SERIALIZE_PROPS)
    const str  = JSON.stringify(json)
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
    const bg  = localStorage.getItem(STORAGE_BG)
    if (bg) canvas.setBackgroundColor(bg, () => {})
    if (!raw) { onDone(); return }
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.objects) { onDone(); return }
    canvas.loadFromJSON(parsed, () => {
      canvas.getObjects().forEach(obj => {
        obj.set({ selectable: true, evented: true, objectCaching: true, padding: 10 })
        if (obj.isEraserStroke) obj.set({ selectable: false, evented: false })
        
        // Re-attach sticky note event handlers
        if (obj.stickyText) {
          const txt = canvas.getObjects().find(o => o === obj.stickyText)
          if (txt) {
            obj.on('moving', function(){ 
              this.stickyText?.set({left:this.left+16,top:this.top+16})
              this.stickyText?.setCoords() 
            })
            obj.on('scaling', function(){ 
              this.stickyText?.set({left:this.left+16,top:this.top+16})
              this.stickyText?.setCoords() 
            })
            obj.on('rotating', function(){ 
              this.stickyText?.set({left:this.left+16,top:this.top+16})
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
  front:    <><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></>,
  forward:  <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="19 12 12 5 5 12"/></>,
  backward: <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/></>,
  back:     <><polyline points="17 6 12 11 7 6"/><polyline points="17 13 12 18 7 13"/></>,
  copy:     <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  delete:   <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
}

const CtxMenu = ({ x, y, items, onClose }) => {
  const ref = useRef(null)
  useEffect(() => {
    const onDown = (e) => { 
      if (ref.current && !ref.current.contains(e.target)) {
        onClose() 
      }
    }
    const onKey = (e) => { 
      if (e.key === 'Escape') onClose() 
    }
    
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
  const safeX = Math.min(x, window.innerWidth  - W - 8)
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

const TextFormatBar = ({ format, onChange }) => {
  const [showFonts, setShowFonts] = useState(false)
  const fontRef = useRef(null)
  useEffect(() => {
    const h = (e) => { if (!fontRef.current?.contains(e.target)) setShowFonts(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="wb-text-bar">
      <div className="wb-text-bar__font" ref={fontRef}>
        <button className="wb-text-bar__font-btn" onClick={() => setShowFonts(v => !v)}>
          <span style={{ fontFamily: format.fontFamily }}>{format.fontFamily}</span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {showFonts && (
          <div className="wb-text-bar__font-list">
            {FONTS.map(f => (
              <button key={f}
                className={`wb-text-bar__font-item${format.fontFamily === f ? ' active' : ''}`}
                style={{ fontFamily: f }}
                onClick={() => { onChange({ fontFamily: f }); setShowFonts(false) }}>
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="wb-text-bar__sep" />
      <div className="wb-text-bar__size">
        <button className="wb-text-bar__size-btn" onClick={() => onChange({ fontSize: Math.max(8, format.fontSize - 1) })}>−</button>
        <input
          className="wb-text-bar__size-input"
          type="number" min="8" max="200" value={format.fontSize}
          onChange={e => { const v = parseInt(e.target.value); if (v >= 8 && v <= 200) onChange({ fontSize: v }) }}
        />
        <button className="wb-text-bar__size-btn" onClick={() => onChange({ fontSize: Math.min(200, format.fontSize + 1) })}>+</button>
      </div>
      <div className="wb-text-bar__sep" />
      <button className={`wb-text-bar__fmt-btn${format.bold   ? ' active' : ''}`} onClick={() => onChange({ bold:   !format.bold   })} title="Bold"><strong>B</strong></button>
      <button className={`wb-text-bar__fmt-btn${format.italic ? ' active' : ''}`} onClick={() => onChange({ italic: !format.italic })} title="Italic"><em style={{ fontStyle:'italic' }}>I</em></button>
    </div>
  )
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
  const isPanningRef    = useRef(false)
  const lastPanPosRef   = useRef(null)

  const historyRef    = useRef([])
  const historyIdxRef = useRef(-1)
  const isMutingRef   = useRef(false)

  const [selectedObject, setSelectedObject] = useState(null)
  const [contextMenu,    setContextMenu]    = useState(null)
  const [textFormat,     setTextFormat]     = useState({ fontSize: 20, fontFamily: 'DM Sans', bold: false, italic: false })
  const [showTextBar,    setShowTextBar]    = useState(false)

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
    const json = canvas.toJSON(SERIALIZE_PROPS)
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
      const maxW  = canvas.getWidth()  * 0.6
      const maxH  = canvas.getHeight() * 0.6
      const scale = Math.min(maxW / img.width, maxH / img.height, 1)
      img.set({
        left: (canvas.getWidth()  - img.width  * scale) / 2,
        top:  (canvas.getHeight() - img.height * scale) / 2,
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
    window.__wbUndo     = undo
    window.__wbRedo     = redo
    window.__wbClear    = clearCanvas
    window.__wbAddImage = addImage
    window.__wbDelete   = deleteSelected
    return () => {
      delete window.__wbUndo; delete window.__wbRedo
      delete window.__wbClear; delete window.__wbAddImage; delete window.__wbDelete
    }
  }, [undo, redo, clearCanvas, addImage, deleteSelected])

  useEffect(() => {
    const container = containerRef.current
    const canvas = new fabric.Canvas(canvasRef.current, {
      width:  container.clientWidth,
      height: container.clientHeight,
      backgroundColor:        canvasBackground || '#ffffff',
      selection:              true,
      selectionColor:         'rgba(26,115,232,0.07)',
      selectionBorderColor:   '#1a73e8',
      selectionLineWidth:     1.5,
      selectionDashArray:     [5, 3],
      preserveObjectStacking: true,
      defaultCursor:          'default',
      hoverCursor:            'move',
      moveCursor:             'move',
      rotationCursor:         'crosshair',
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
    deserializeCanvas(canvas, () => pushSnapshot())

    const onMutation = () => {
      if (isMutingRef.current || isDrawingRef.current) return
      serializeCanvas(canvas); pushSnapshot()
    }
    canvas.on('object:added',    onMutation)
    canvas.on('object:modified', onMutation)
    canvas.on('object:removed',  onMutation)

    canvas.on('path:created', (opt) => {
      if (toolRef.current === 'eraser')
        opt.path.set({ isEraserStroke: true, selectable: false, evented: false })
    })

    const syncTextBar = (obj) => {
      if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
        setTextFormat({
          fontSize:   obj.fontSize || 20,
          fontFamily: (obj.fontFamily || 'DM Sans').replace(/'/g,'').replace(',sans-serif','').trim(),
          bold:       obj.fontWeight === 'bold',
          italic:     obj.fontStyle  === 'italic',
        })
        setShowTextBar(true)
      } else {
        setShowTextBar(false)
      }
    }
    canvas.on('selection:created', (e) => { const o = e.selected?.[0]; setSelectedObject(o && SHAPE_TYPES.includes(o.type) ? o : null); syncTextBar(o) })
    canvas.on('selection:updated', (e) => { const o = e.selected?.[0]; setSelectedObject(o && SHAPE_TYPES.includes(o.type) ? o : null); syncTextBar(o) })
    canvas.on('selection:cleared', ()  => { setSelectedObject(null); setShowTextBar(false) })

    const upperCanvas = canvas.upperCanvasEl ?? canvas.wrapperEl?.querySelector('canvas.upper-canvas')
    const handleContextMenu = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const target = canvas.findTarget(e, false)
      if (!target) return
      canvas.setActiveObject(target)
      canvas.renderAll()
      setContextMenu({ clientX: e.clientX, clientY: e.clientY, target })
    }
    const ctxEl = upperCanvas || canvas.wrapperEl
    ctxEl?.addEventListener('contextmenu', handleContextMenu)

    const resizeObserver = new ResizeObserver((entries) => {
      for (const { contentRect: { width, height } } of entries) {
        canvas.setDimensions({ width, height }); canvas.renderAll()
      }
    })
    resizeObserver.observe(container)
    const onBeforeUnload = () => serializeCanvas(canvas)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      ctxEl?.removeEventListener('contextmenu', handleContextMenu)
      resizeObserver.disconnect()
      window.removeEventListener('beforeunload', onBeforeUnload)
      canvas.dispose()
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const ctxItems = useCallback((target) => {
    const c = fabricRef.current
    if (!c || !target) return []
    const reorderAndSnap = (moveFn) => {
      moveFn()
      c.discardActiveObject()
      c.renderAll()
      requestAnimationFrame(() => {
        c.setActiveObject(target)
        target.setCoords()
        c.renderAll()
        serializeCanvas(c)
        pushSnapshot()
      })
    }
    return [
      { 
        label: 'Bring Forward',  
        icon: 'forward',  
        action: () => reorderAndSnap(() => c.bringForward(target))
      },
      { 
        label: 'Send Backward',  
        icon: 'backward', 
        action: () => reorderAndSnap(() => c.sendBackwards(target))
      },
      { divider: true },
      { 
        label: 'Duplicate', 
        icon: 'copy', 
        action: () => {
          target.clone((cl) => {
            cl.set({ 
              left: target.left + 16, 
              top: target.top + 16, 
              selectable: true, 
              evented: true 
            })
            c.add(cl)
            c.setActiveObject(cl)
            snap()
          }, ['stickyText', 'stickyRect'])
        }
      },
      { divider: true },
      { 
        label: 'Delete', 
        icon: 'delete', 
        danger: true, 
        action: () => {
          if (target.stickyText) c.remove(target.stickyText)
          if (target.stickyRect) c.remove(target.stickyRect)
          c.remove(target)
          c.discardActiveObject()
          snap()
        }
      },
    ]
  }, [pushSnapshot])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !canvasBackground) return
    canvas.setBackgroundColor(canvasBackground, () => {
      canvas.getObjects().forEach(obj => { if (obj.isEraserStroke) obj.set('stroke', canvasBackground) })
      canvas.renderAll()
      localStorage.setItem(STORAGE_BG, canvasBackground)
      serializeCanvas(canvas)
    })
  }, [canvasBackground])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.isDrawingMode = false
    canvas.selection     = false

    const hexRgba = (hex, a) => {
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
      return `rgba(${r},${g},${b},${a})`
    }
    const disableAll = (o) => { o.selectable = false; o.evented = false }

    switch (tool) {
      case 'select':
        canvas.selection = true
        canvas.forEachObject(o => { if (!o.isEraserStroke) { o.selectable = true; o.evented = true } })
        canvas.defaultCursor = 'default'
        canvas.hoverCursor = 'move'
        canvas.moveCursor = 'move'
        break
      case 'pan':
        canvas.selection = false
        canvas.forEachObject(disableAll)
        canvas.defaultCursor = 'grab'
        canvas.hoverCursor = 'grab'
        canvas.moveCursor = 'grabbing'
        canvas.setCursor('grab')
        break
      case 'pen':
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        canvas.freeDrawingBrush.color    = color
        canvas.freeDrawingBrush.width    = strokeWidth
        canvas.freeDrawingBrush.decimate = 2
        canvas.defaultCursor = 'crosshair'
        canvas.hoverCursor = 'crosshair'
        break
      case 'eraser':
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        canvas.freeDrawingBrush.color = canvasBackground || '#ffffff'
        canvas.freeDrawingBrush.width = strokeWidth * 5
        canvas.defaultCursor = 'crosshair'
        canvas.hoverCursor = 'crosshair'
        break
      case 'highlighter': {
        canvas.isDrawingMode = true
        const hb = new fabric.PencilBrush(canvas)
        hb.color = hexRgba(color, 0.3); hb.width = strokeWidth * 6
        canvas.freeDrawingBrush = hb
        canvas.defaultCursor = 'crosshair'
        canvas.hoverCursor = 'crosshair'
        break
      }
      case 'laser':
      case 'frame':
        canvas.isDrawingMode = false
        canvas.selection = false
        canvas.forEachObject(disableAll)
        canvas.defaultCursor = 'crosshair'
        canvas.hoverCursor = 'crosshair'
        break
      default:
        canvas.forEachObject(disableAll)
        canvas.defaultCursor = 'crosshair'
        canvas.hoverCursor = 'crosshair'
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

      if (tool === 'pan') {
        isPanningRef.current  = true
        lastPanPosRef.current = { x: opt.e.clientX, y: opt.e.clientY }
        canvas.setCursor('grabbing')
        return
      }

      if (tool === 'frame') {
        isDrawingRef.current  = true
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

      if (DRAW_SKIP.includes(tool)) return

      isDrawingRef.current  = true
      const ptr = canvas.getPointer(opt.e)
      startPointRef.current = ptr

      const c      = colorRef.current
      const sw     = strokeRef.current
      const filled = fillRef.current
      const base   = {
        fill: filled ? c : 'rgba(255,255,255,0.01)',
        stroke: c, strokeWidth: sw,
        selectable: false, evented: false, objectCaching: false,
        padding: 10, strokeUniform: true, strokeLineCap: 'round', strokeLineJoin: 'round',
      }

      let shape = null
      switch (tool) {
        case 'line':
          shape = new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], { stroke:c, strokeWidth:sw, selectable:false, evented:false, strokeLineCap:'round', objectCaching:false, padding:10 })
          break
        case 'rectangle':
          shape = new fabric.Rect({ ...base, left:ptr.x, top:ptr.y, width:0, height:0, rx:2, ry:2 })
          break
        case 'circle':
          shape = new fabric.Circle({ ...base, left:ptr.x, top:ptr.y, radius:0 })
          break
        case 'triangle':
          shape = new fabric.Triangle({ ...base, left:ptr.x, top:ptr.y, width:0, height:0 })
          break
        case 'ellipse':
          shape = new fabric.Ellipse({ ...base, left:ptr.x, top:ptr.y, rx:0, ry:0 })
          break
        case 'arrow':
          shape = makeArrow(ptr.x, ptr.y, ptr.x, ptr.y, c, sw)
          break
        case 'diamond':
          shape = new fabric.Polygon([{x:0,y:-50},{x:50,y:0},{x:0,y:50},{x:-50,y:0}], { ...base, left:ptr.x, top:ptr.y })
          break
        case 'star': {
          const pts = []
          for (let i=0;i<10;i++){const r=i%2===0?50:25,a=(i*Math.PI)/5-Math.PI/2;pts.push({x:r*Math.cos(a),y:r*Math.sin(a)})}
          shape = new fabric.Polygon(pts, { ...base, left:ptr.x, top:ptr.y })
          break
        }
        case 'hexagon': {
          const pts = []
          for (let i=0;i<6;i++){const a=(i*Math.PI)/3;pts.push({x:50*Math.cos(a),y:50*Math.sin(a)})}
          shape = new fabric.Polygon(pts, { ...base, left:ptr.x, top:ptr.y })
          break
        }
        case 'text': {
          const t = new fabric.IText('Type here…', { left:ptr.x, top:ptr.y, fill:c, fontSize:20, fontFamily:"'DM Sans',sans-serif", selectable:true, evented:true, padding:10 })
          canvas.add(t); canvas.setActiveObject(t); t.enterEditing(); canvas.renderAll()
          return
        }
        case 'sticky': {
          const W = 300
          const rect = new fabric.Rect({ left:ptr.x, top:ptr.y, width:W, height:W, fill:'#fff9c4', stroke:'#f9e44f', strokeWidth:1.5, rx:8, ry:8, shadow:new fabric.Shadow({color:'rgba(0,0,0,.10)',blur:12,offsetX:2,offsetY:4}), selectable:true, evented:true })
          const txt  = new fabric.Textbox('Note…', { left:ptr.x+16, top:ptr.y+16, width:W-32, fontSize:16, fontFamily:"'DM Sans',sans-serif", fill:'#333', textAlign:'left', editable:true, selectable:true, evented:true, hasControls:false, hasBorders:false })
          rect.stickyText = txt; txt.stickyRect = rect
          
          // Sync text position when rect moves
          rect.on('moving', function(){ 
            this.stickyText?.set({left:this.left+16,top:this.top+16})
            this.stickyText?.setCoords() 
          })
          
          // Sync text position when rect is modified (scaled, rotated, etc)
          rect.on('scaling', function(){ 
            this.stickyText?.set({left:this.left+16,top:this.top+16})
            this.stickyText?.setCoords() 
          })
          
          rect.on('rotating', function(){ 
            this.stickyText?.set({left:this.left+16,top:this.top+16})
            this.stickyText?.setCoords() 
          })
          
          canvas.add(rect); canvas.add(txt); canvas.setActiveObject(txt)
          setTimeout(()=>{ txt.enterEditing(); txt.selectAll() },100)
          setTimeout(()=>setTool('select'),300)
          canvas.renderAll()
          return
        }
        default: break
      }
      if (shape) { currentShapeRef.current = shape; canvas.add(shape) }
    }

    const onMouseMove = (opt) => {
      if (tool === 'pan' && isPanningRef.current && lastPanPosRef.current) {
        const dx = opt.e.clientX - lastPanPosRef.current.x
        const dy = opt.e.clientY - lastPanPosRef.current.y
        const vpt = canvas.viewportTransform.slice()
        vpt[4] += dx; vpt[5] += dy
        canvas.setViewportTransform(vpt); canvas.renderAll()
        lastPanPosRef.current = { x: opt.e.clientX, y: opt.e.clientY }
        return
      }
      if (!isDrawingRef.current || !currentShapeRef.current) return
      const ptr = canvas.getPointer(opt.e)
      const s   = currentShapeRef.current
      const sp  = startPointRef.current

      if (tool === 'frame') {
        const w = ptr.x - sp.x, h = ptr.y - sp.y
        s.set({ width: Math.abs(w), height: Math.abs(h), left: w>0?sp.x:ptr.x, top: h>0?sp.y:ptr.y })
        canvas.renderAll(); return
      }

      switch (tool) {
        case 'line': s.set({ x2:ptr.x, y2:ptr.y }); break
        case 'rectangle': case 'triangle': {
          const w=ptr.x-sp.x,h=ptr.y-sp.y
          s.set({ width:Math.abs(w), height:Math.abs(h), left:w>0?sp.x:ptr.x, top:h>0?sp.y:ptr.y })
          break
        }
        case 'circle': s.set({ radius: Math.abs(Math.hypot(ptr.x-sp.x,ptr.y-sp.y)/2) }); break
        case 'arrow': {
          canvas.remove(s)
          currentShapeRef.current = makeArrow(sp.x,sp.y,ptr.x,ptr.y,colorRef.current,strokeRef.current)
          canvas.add(currentShapeRef.current)
          break
        }
        case 'diamond': case 'star': case 'hexagon': {
          const sc = Math.hypot(ptr.x-sp.x,ptr.y-sp.y)/50
          s.set({ scaleX:sc, scaleY:sc }); break
        }
        case 'ellipse': {
          const rx=Math.abs(ptr.x-sp.x)/2, ry=Math.abs(ptr.y-sp.y)/2
          s.set({ rx, ry, left:sp.x+(ptr.x-sp.x)/2, top:sp.y+(ptr.y-sp.y)/2 }); break
        }
        default: break
      }
      canvas.renderAll()
    }

    const onMouseUp = () => {
      if (tool === 'pan') {
        isPanningRef.current = false; lastPanPosRef.current = null
        canvas.setCursor('grab'); return
      }
      if (currentShapeRef.current) {
        const obj = currentShapeRef.current
        if (obj.isFrame) {
          obj.set({ selectable:true, evented:true, objectCaching:true }); obj.setCoords()
          canvas.sendToBack(obj)
        } else {
          obj.set({ selectable:true, evented:true, objectCaching:true }); obj.setCoords()
          if (obj.type !== 'line' && obj.type !== 'group')
            obj.shadow = new fabric.Shadow({ color:'rgba(0,0,0,.08)', blur:8, offsetX:0, offsetY:2 })
        }
      }
      const wasDrawing = isDrawingRef.current
      isDrawingRef.current = false; currentShapeRef.current = null; startPointRef.current = null
      if (wasDrawing) {
        canvas.fire('object:modified')
        if (tool !== 'select' && tool !== 'pen' && tool !== 'laser') setTool('select')
      }
    }

    canvas.on('mouse:down', onMouseDown)
    canvas.on('mouse:move', onMouseMove)
    canvas.on('mouse:up',   onMouseUp)
    return () => {
      canvas.off('mouse:down', onMouseDown)
      canvas.off('mouse:move', onMouseMove)
      canvas.off('mouse:up',   onMouseUp)
    }
  }, [tool, setTool])  // eslint-disable-line react-hooks/exhaustive-deps

  const makeArrow = (x1,y1,x2,y2,c,sw) => {
    const angle=Math.atan2(y2-y1,x2-x1), headLen=Math.max(14,sw*4)
    const line=new fabric.Line([x1,y1,x2,y2],{stroke:c,strokeWidth:sw,strokeLineCap:'round',padding:10,objectCaching:false})
    const head=new fabric.Triangle({left:x2,top:y2,width:headLen,height:headLen,fill:c,angle:(angle*180/Math.PI)+90,originX:'center',originY:'center',objectCaching:false})
    return new fabric.Group([line,head],{selectable:false,evented:false})
  }

  const applyTextFormat = useCallback((changes) => {
    const canvas = fabricRef.current
    if (!canvas) return
    const obj = canvas.getActiveObject()
    if (!obj || (obj.type !== 'i-text' && obj.type !== 'textbox')) return
    const next = { ...textFormat, ...changes }
    obj.set({
      fontSize:   next.fontSize,
      fontFamily: `'${next.fontFamily}',sans-serif`,
      fontWeight: next.bold   ? 'bold'   : 'normal',
      fontStyle:  next.italic ? 'italic' : 'normal',
    })
    canvas.renderAll(); setTextFormat(next); serializeCanvas(canvas); pushSnapshot()
  }, [textFormat, pushSnapshot])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.on('mouse:dblclick', (e) => {
      if (e.target?.type === 'textbox' || e.target?.type === 'i-text') { e.target.enterEditing(); e.target.selectAll() }
    })
    const onKey = (e) => {
      const c = fabricRef.current; if (!c) return
      const active = c.getActiveObject()
      if (active && (active.type==='textbox'||active.type==='i-text') && active.isEditing) return
      if (e.key==='Delete'||e.key==='Backspace') { e.preventDefault(); deleteSelected() }
      if (e.ctrlKey||e.metaKey) {
        if (e.key==='c') { const o=c.getActiveObject(); if(o) o.clone(cl=>{window._clipboard=cl}) }
        if (e.key==='v'&&window._clipboard) {
          window._clipboard.clone(cl=>{
            c.discardActiveObject()
            cl.set({left:cl.left+10,top:cl.top+10,evented:true})
            if(cl.type==='activeSelection'){cl.canvas=c;cl.forEachObject(o=>c.add(o));cl.setCoords()}else{c.add(cl)}
            window._clipboard.top+=10; window._clipboard.left+=10
            c.setActiveObject(cl); c.requestRenderAll()
          })
        }
        if (e.key==='z') { e.preventDefault(); undo() }
        if (e.key==='y') { e.preventDefault(); redo() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, deleteSelected])

  return (
    <div ref={containerRef} className={`whiteboard-container ${tool ? `tool-${tool}` : ''}`}>
      <canvas ref={canvasRef} />
      <LaserPointer active={tool === 'laser'} containerRef={containerRef} />
      <ShapeProperties canvas={fabricRef.current} selectedObject={selectedObject} />

      {showTextBar && <TextFormatBar format={textFormat} onChange={applyTextFormat} />}

      {contextMenu && (
        <CtxMenu
          x={contextMenu.clientX}
          y={contextMenu.clientY}
          items={ctxItems(contextMenu.target)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

export default Whiteboard