import { useEffect, useState } from 'react'
import './ShapeProperties.css'

const STROKE_COLORS = [
  '#000000','#374151','#6b7280','#ef4444',
  '#f97316','#eab308','#22c55e','#3b82f6',
  '#8b5cf6','#ec4899',
]

const FILL_COLORS = [
  'transparent',
  '#fecaca','#fed7aa','#fef08a','#bbf7d0',
  '#bae6fd','#c4b5fd','#fbcfe8','#e5e7eb',
  '#ffffff','#111827',
]

const STROKE_WIDTHS = [1, 2, 4, 8]

const STROKE_STYLES = [
  { id: 'solid',  label: 'Solid',  dashArray: [] },
  { id: 'dashed', label: 'Dashed', dashArray: [8, 4] },
  { id: 'dotted', label: 'Dotted', dashArray: [2, 4] },
]

const FILL_PATTERNS = [
  { id: 'solid', label: 'Solid', cls: 'pattern-solid' },
  { id: 'hatch', label: 'Hatch', cls: 'pattern-hatch' },
  { id: 'cross', label: 'Cross', cls: 'pattern-cross' },
  { id: 'dots',  label: 'Dots',  cls: 'pattern-dots'  },
]

const SLOPPINESS = [
  { id: 'neat',   label: 'Neat',   path: 'M 2 10 L 38 10' },
  { id: 'normal', label: 'Normal', path: 'M 2 11 Q 12 9 20 10 Q 28 11 38 10' },
  { id: 'rough',  label: 'Rough',  path: 'M 2 10 Q 8 8 14 11 Q 22 7 30 12 Q 34 13 38 10' },
]

const EDGE_TYPES = [
  { id: 'sharp', label: 'Sharp', rx: 0,  icon: <rect x="5" y="5" width="20" height="20" stroke="currentColor" fill="none" strokeWidth="2"/> },
  { id: 'round', label: 'Round', rx: 6,  icon: <rect x="5" y="5" width="20" height="20" rx="6" stroke="currentColor" fill="none" strokeWidth="2"/> },
]

const ShapeProperties = ({ canvas, selectedObject }) => {
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [fillColor,   setFillColor]   = useState('transparent')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [strokeStyle, setStrokeStyle] = useState('solid')
  const [fillPattern, setFillPattern] = useState('solid')
  const [sloppiness,  setSloppiness]  = useState('neat')
  const [edgeType,    setEdgeType]    = useState('sharp')
  const [opacity,     setOpacity]     = useState(100)
  const [isVisible,   setIsVisible]   = useState(true)

  useEffect(() => {
    if (!selectedObject) {
      setIsVisible(false)
      return
    }
    setIsVisible(true)
    setStrokeColor(selectedObject.stroke || '#000000')
    const f = selectedObject.fill
    setFillColor(!f || f === '' ? 'transparent' : f)
    setStrokeWidth(selectedObject.strokeWidth ?? 2)
    setOpacity(Math.round((selectedObject.opacity ?? 1) * 100))
    const da = selectedObject.strokeDashArray
    if (!da || da.length === 0) setStrokeStyle('solid')
    else if (da[0] <= 2)        setStrokeStyle('dotted')
    else                        setStrokeStyle('dashed')
    
    if (selectedObject.type === 'rect') {
      const rx = selectedObject.rx ?? 0
      setEdgeType(rx > 0 ? 'round' : 'sharp')
    }
  }, [selectedObject])

  const apply = (props) => {
    if (!selectedObject || !canvas) return
    selectedObject.set(props)
    selectedObject.setCoords()
    canvas.renderAll()
    // Use requestAnimationFrame to ensure the render completes before firing the event
    // This ensures the snapshot captures the updated state
    requestAnimationFrame(() => {
      // Fire object:modified event to trigger history snapshot, database save, and realtime broadcast
      canvas.fire('object:modified', { target: selectedObject })
    })
  }

  const handleStrokeColor  = (c) => { setStrokeColor(c);  apply({ stroke: c }) }

  const handleFillColor    = (c) => {
    setFillColor(c)
    apply({ fill: c === 'transparent' ? 'transparent' : c })
  }

  const handleStrokeWidth  = (w) => { setStrokeWidth(w);  apply({ strokeWidth: w }) }
  const handleStrokeStyle  = (id) => {
    setStrokeStyle(id)
    apply({ strokeDashArray: STROKE_STYLES.find(s => s.id === id)?.dashArray ?? [] })
  }
  const handleOpacity      = (v) => { setOpacity(v);      apply({ opacity: v / 100 }) }
  const handleEdgeType     = (id) => {
    setEdgeType(id)
    const r = EDGE_TYPES.find(e => e.id === id)?.rx ?? 0
    if (selectedObject?.type === 'rect') {
      apply({ rx: r, ry: r })
    }
  }

  const handleFillPattern = (id) => {
    setFillPattern(id)
    if (id === 'solid') {
      // Store pattern type for serialization
      selectedObject.fillPatternType = null
      selectedObject.fillPatternColor = null
      apply({ fill: fillColor === 'transparent' ? 'transparent' : fillColor })
    } else {
      try {
        const patternCanvas = document.createElement('canvas')
        patternCanvas.width = 10
        patternCanvas.height = 10
        const ctx = patternCanvas.getContext('2d')
        
        if (!ctx) {
          console.error('[handleFillPattern] Failed to get 2d context')
          return
        }
        
        ctx.strokeStyle = strokeColor
        ctx.fillStyle = strokeColor
        ctx.lineWidth = 1

        if (id === 'hatch') {
          ctx.beginPath()
          ctx.moveTo(0, 10)
          ctx.lineTo(10, 0)
          ctx.stroke()
        } else if (id === 'cross') {
          ctx.beginPath()
          ctx.moveTo(0, 10)
          ctx.lineTo(10, 0)
          ctx.moveTo(0, 0)
          ctx.lineTo(10, 10)
          ctx.stroke()
        } else if (id === 'dots') {
          ctx.beginPath()
          ctx.arc(5, 5, 1.5, 0, Math.PI * 2)
          ctx.fill()
        }

        const pattern = new fabric.Pattern({
          source: patternCanvas,
          repeat: 'repeat'
        })
        
        // Store pattern type and color for serialization
        selectedObject.fillPatternType = id
        selectedObject.fillPatternColor = strokeColor
        
        console.log('[handleFillPattern] Created pattern:', id, 'color:', strokeColor)
        apply({ fill: pattern })
      } catch (err) {
        console.error('[handleFillPattern] Failed to create pattern:', err)
      }
    }
  }

  const handleSloppiness = (id) => {
    setSloppiness(id)
    if (!selectedObject || !canvas) return

    switch (id) {
      case 'neat':
        selectedObject.set({
          shadow: null,
          strokeWidth: strokeWidth
        })
        break
        
      case 'normal':
        selectedObject.set({
          shadow: new fabric.Shadow({
            color: 'rgba(0,0,0,0.15)',
            blur: 3,
            offsetX: 1,
            offsetY: 1
          }),
          strokeWidth: strokeWidth
        })
        break
        
      case 'rough':
        selectedObject.set({
          shadow: new fabric.Shadow({
            color: 'rgba(0,0,0,0.25)',
            blur: 5,
            offsetX: 2,
            offsetY: 2
          }),
          strokeWidth: strokeWidth + 1
        })
        break
    }
    
    selectedObject.setCoords()
    canvas.renderAll()
  }

  if (!selectedObject || !isVisible) return null

  return (
    <div className="shape-properties">

      <div className="sp-header">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
        <span>Shape</span>
        <button className="sp-close" onClick={() => setIsVisible(false)} title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="properties-section">
        <h3>Stroke</h3>
        <div className="color-grid">
          {STROKE_COLORS.map(c => (
            <button key={c} className={`color-box ${strokeColor === c ? 'active' : ''}`}
              style={{ backgroundColor: c }} onClick={() => handleStrokeColor(c)} title={c} />
          ))}
        </div>
      </div>

      <div className="properties-section">
        <h3>Fill</h3>
        <div className="color-grid">
          {FILL_COLORS.map(c => (
            <button key={c} className={`color-box ${fillColor === c ? 'active' : ''}`}
              style={c === 'transparent'
                ? {
                    backgroundColor: '#fff',
                    backgroundImage:
                      'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),' +
                      'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)',
                    backgroundSize: '10px 10px',
                    backgroundPosition: '0 0,5px 5px',
                  }
                : { backgroundColor: c }
              }
              onClick={() => handleFillColor(c)} title={c === 'transparent' ? 'No fill' : c}
            />
          ))}
        </div>
      </div>

      <div className="properties-section">
        <h3>Fill pattern</h3>
        <div className="fill-patterns">
          {FILL_PATTERNS.map(p => (
            <button key={p.id} className={`pattern-btn ${fillPattern === p.id ? 'active' : ''}`}
              title={p.label} onClick={() => handleFillPattern(p.id)}>
              <div className={p.cls} />
            </button>
          ))}
        </div>
      </div>

      <div className="properties-section">
        <h3>Stroke width</h3>
        <div className="stroke-width-options">
          {STROKE_WIDTHS.map(w => (
            <button key={w} className={`stroke-width-btn ${strokeWidth === w ? 'active' : ''}`}
              onClick={() => handleStrokeWidth(w)} title={`${w}px`}>
              <div style={{ height: `${w}px`, borderRadius: '2px' }} />
            </button>
          ))}
        </div>
      </div>

      <div className="properties-section">
        <h3>Stroke style</h3>
        <div className="stroke-style-options">
          {STROKE_STYLES.map(s => (
            <button key={s.id} className={`stroke-style-btn ${strokeStyle === s.id ? 'active' : ''}`}
              title={s.label} onClick={() => handleStrokeStyle(s.id)}>
              <div className={`line-${s.id}`} />
            </button>
          ))}
        </div>
      </div>

      <div className="properties-section">
        <h3>Sloppiness</h3>
        <div className="sloppiness-options">
          {SLOPPINESS.map(s => (
            <button key={s.id} className={`sloppiness-btn ${sloppiness === s.id ? 'active' : ''}`}
              title={s.label} onClick={() => handleSloppiness(s.id)}>
              <svg width="40" height="22" viewBox="0 0 40 22">
                <path d={s.path} stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {selectedObject?.type === 'rect' && (
        <div className="properties-section">
          <h3>Edges</h3>
          <div className="edges-options">
            {EDGE_TYPES.map(e => (
              <button key={e.id} className={`edge-btn ${edgeType === e.id ? 'active' : ''}`}
                title={e.label} onClick={() => handleEdgeType(e.id)}>
                <svg width="30" height="30" viewBox="0 0 30 30">{e.icon}</svg>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="properties-section">
        <h3>Opacity</h3>
        <div className="opacity-control">
          <input type="range" min={0} max={100} value={opacity}
            onChange={e => handleOpacity(Number(e.target.value))} />
          <span className="opacity-value">{opacity}%</span>
        </div>
      </div>

    </div>
  )
}

export default ShapeProperties