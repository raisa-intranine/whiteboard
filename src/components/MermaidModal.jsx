import { useState, useEffect, useRef } from 'react'
import mermaid from 'mermaid'
import { fabric } from 'fabric'
import './MermaidModal.css'

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'DM Sans, sans-serif',
  themeVariables: {
    xyChart: {
      plotColorPalette: '#1a73e8, #ea4335, #34a853, #fbbc05, #9c27b0',
    }
  }
})

const MERMAID_EXAMPLES = {
  flowchart: `flowchart TD
    A[Start Project] --> B{Requirements Clear?}
    B -->|Yes| C[Design Phase]
    B -->|No| D[Gather Requirements]
    D --> B
    C --> E[Development]
    E --> F[Testing]
    F --> G{Tests Pass?}
    G -->|Yes| H[Deploy]
    G -->|No| E
    H --> I[End]`,
  
  sequence: `sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant Database
    User->>Frontend: Login Request
    Frontend->>API: POST /auth/login
    API->>Database: Verify Credentials
    Database-->>API: User Data
    API-->>Frontend: JWT Token
    Frontend-->>User: Login Success`,
  
  class: `classDiagram
    class User {
        +String name
        +String email
        +String password
        +login()
        +logout()
    }
    class Board {
        +String id
        +String title
        +Date createdAt
        +save()
        +delete()
    }
    class Permission {
        +String role
        +Boolean canEdit
        +checkAccess()
    }
    User "1" --> "*" Board : owns
    User "*" --> "*" Board : collaborates
    Board "1" --> "*" Permission : has`,
  
  state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Loading: User Opens App
    Loading --> Ready: Data Loaded
    Loading --> Error: Load Failed
    Ready --> Editing: User Draws
    Editing --> Saving: Auto-save
    Saving --> Ready: Save Success
    Saving --> Error: Save Failed
    Error --> Idle: Retry
    Ready --> [*]: User Closes`,
  
  er: `erDiagram
    USER ||--o{ BOARD : creates
    USER ||--o{ PERMISSION : has
    BOARD ||--|{ PERMISSION : grants
    BOARD ||--o{ SHAPE : contains
    USER {
        uuid id PK
        string name
        string email
        timestamp created_at
    }
    BOARD {
        uuid id PK
        string title
        json canvas_data
        timestamp updated_at
    }
    PERMISSION {
        uuid user_id FK
        uuid board_id FK
        string role
    }`,
  
  gantt: `gantt
    title Website Development Timeline
    dateFormat YYYY-MM-DD
    section Planning
    Requirements Gathering :done, plan1, 2024-01-01, 5d
    Design Mockups :done, plan2, after plan1, 7d
    section Development
    Frontend Setup :active, dev1, after plan2, 3d
    Backend API :dev2, after dev1, 10d
    Database Schema :dev3, after dev1, 5d
    Integration :dev4, after dev2, 7d
    section Testing
    Unit Tests :test1, after dev4, 5d
    User Testing :test2, after test1, 7d
    section Deployment
    Production Deploy :deploy, after test2, 2d`,
  
  pie: `pie title Project Time Distribution
    "Development" : 45
    "Testing" : 20
    "Meetings" : 15
    "Documentation" : 10
    "Bug Fixes" : 10`,
  
  bar: `%%{init: {'theme':'base'}}%%
xychart-beta
    title "Monthly Active Users"
    x-axis [Jan, Feb, Mar, Apr, May, Jun]
    y-axis "Users (thousands)" 0 --> 100
    bar [45, 52, 61, 73, 85, 92]
    line [45, 52, 61, 73, 85, 92]`,
  
  xy: `%%{init: {'theme':'base'}}%%
xychart-beta
    title "Revenue Growth 2024"
    x-axis [Q1, Q2, Q3, Q4]
    y-axis "Revenue ($M)" 0 --> 500
    line [120, 250, 380, 450]`,
}

const MermaidModal = ({ visible, onClose, canvas, theme, mode = 'generate' }) => {
  const [mermaidCode, setMermaidCode] = useState('')
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [selectedType, setSelectedType] = useState('flowchart')
  const [generateType, setGenerateType] = useState('flowchart')
  const [svgContent, setSvgContent] = useState('')
  const [previewZoom, setPreviewZoom] = useState(100)

  const prevVisible = useRef(visible)
  const prevSelectedType = useRef(selectedType)
  const prevGenerateType = useRef(generateType)

  useEffect(() => {
    const opening = visible && !prevVisible.current
    const tabClickCreate = visible && mode === 'create' && selectedType !== prevSelectedType.current
    const tabClickGen = visible && mode === 'generate' && generateType !== prevGenerateType.current
    
    prevVisible.current = visible
    prevSelectedType.current = selectedType
    prevGenerateType.current = generateType

    if (visible && mode === 'create') {
      if (tabClickCreate || (opening && !mermaidCode)) {
        setMermaidCode(MERMAID_EXAMPLES[selectedType] || '')
        setError('')
      }
    } else if (visible && mode === 'generate') {
      if (opening || tabClickGen) {
        generateMermaidFromCanvas()
      }
    }
  }, [visible, mode, selectedType, generateType, mermaidCode])

  useEffect(() => {
    if (!mermaidCode || !visible || mermaidCode.trim().length < 3) {
      setSvgContent('')
      return
    }
    
    // Debounce rendering to avoid rendering incomplete code
    const timer = setTimeout(() => {
      renderMermaid()
    }, 500)
    
    return () => clearTimeout(timer)
  }, [mermaidCode, visible])

  const generateMermaidFromCanvas = async () => {
    if (!canvas) return

    setGenerating(true)
    setError('')

    try {
      const objects = canvas.getObjects()
      
      // Filter out non-shape objects
      const shapes = objects.filter(obj => 
        ['rect', 'circle', 'ellipse', 'triangle', 'textbox', 'i-text'].includes(obj.type) &&
        !obj.isEraserStroke &&
        !obj.isFrame
      )

      if (shapes.length === 0) {
        // No shapes found - show example code instead
        setError('No shapes found on canvas. Showing example code instead.')
        setMermaidCode(MERMAID_EXAMPLES[generateType])
        setGenerating(false)
        return
      }

      // Helper function to sanitize labels for Mermaid
      const sanitizeLabel = (text) => {
        if (!text) return 'Node'
        // Remove special characters that break Mermaid syntax
        return text
          .replace(/[[\]{}()]/g, '') // Remove brackets and braces
          .replace(/[|]/g, '') // Remove pipes
          .replace(/["'`]/g, '') // Remove quotes
          .replace(/\n/g, ' ') // Replace newlines with spaces
          .trim()
          .slice(0, 50) || 'Node' // Limit length and provide fallback
      }

      let code = ''
      
      if (generateType === 'flowchart') {
        // Flowchart generation based on vertical position
        const sortedShapes = shapes.sort((a, b) => a.top - b.top)
        code = 'flowchart TD\n'
        const nodeMap = new Map()
        
        sortedShapes.forEach((shape, index) => {
          const nodeId = `N${index + 1}`
          let label = 'Node'
          
          // Try to extract text from shape
          if (shape.type === 'textbox' || shape.type === 'i-text') {
            label = sanitizeLabel(shape.text)
          } else if (shape.text) {
            label = sanitizeLabel(shape.text)
          }
          
          // Determine node shape based on object type
          let nodeDeclaration
          if (shape.type === 'circle' || shape.type === 'ellipse') {
            nodeDeclaration = `${nodeId}(("${label}"))`
          } else if (shape.type === 'triangle') {
            nodeDeclaration = `${nodeId}{"${label}"}`
          } else {
            nodeDeclaration = `${nodeId}["${label}"]`
          }
          
          nodeMap.set(shape, nodeId)
          code += `    ${nodeDeclaration}\n`
        })
        
        // Add connections based on proximity
        sortedShapes.forEach((shape, index) => {
          if (index < sortedShapes.length - 1) {
            const currentId = nodeMap.get(shape)
            const nextId = nodeMap.get(sortedShapes[index + 1])
            code += `    ${currentId} --> ${nextId}\n`
          }
        })
      } else if (generateType === 'pie') {
        // Pie chart generation
        code = 'pie title Canvas Shapes\n'
        const shapeCounts = {}
        shapes.forEach(shape => {
          const type = shape.type === 'i-text' || shape.type === 'textbox' ? 'Text' : 
                      shape.type.charAt(0).toUpperCase() + shape.type.slice(1)
          shapeCounts[type] = (shapeCounts[type] || 0) + 1
        })
        Object.entries(shapeCounts).forEach(([type, count]) => {
          code += `    "${type}" : ${count}\n`
        })
      } else if (generateType === 'bar' || generateType === 'xy') {
        // Bar/XY chart generation
        code = `%%{init: {'theme':'base'}}%%\nxychart-beta\n    title "Shape Distribution"\n`
        const shapeCounts = {}
        shapes.forEach(shape => {
          const type = shape.type === 'i-text' || shape.type === 'textbox' ? 'Text' : 
                      shape.type.charAt(0).toUpperCase() + shape.type.slice(1)
          shapeCounts[type] = (shapeCounts[type] || 0) + 1
        })
        const labels = Object.keys(shapeCounts)
        const values = Object.values(shapeCounts)
        code += `    x-axis [${labels.join(', ')}]\n`
        code += `    y-axis "Count" 0 --> ${Math.max(...values) + 2}\n`
        if (generateType === 'bar') {
          code += `    bar [${values.join(', ')}]\n`
        } else {
          code += `    line [${values.join(', ')}]\n`
        }
      } else {
        // For other diagram types, show example
        code = MERMAID_EXAMPLES[generateType] || MERMAID_EXAMPLES.flowchart
      }

      setMermaidCode(code)
    } catch (err) {
      console.error('Failed to generate mermaid:', err)
      setError('Failed to generate diagram code')
    } finally {
      setGenerating(false)
    }
  }

  const renderMermaid = async () => {
    if (!mermaidCode || mermaidCode.trim().length < 3) {
      setSvgContent('')
      return
    }

    try {
      setError('')
      const id = `mermaid-${Date.now()}`
      const { svg } = await mermaid.render(id, mermaidCode)
      
      // Parse and modify SVG to make it high quality and big for all charts
      const parser = new DOMParser()
      const svgDoc = parser.parseFromString(svg, 'image/svg+xml')
      const svgEl = svgDoc.documentElement
      
      let vbWidth = 800, vbHeight = 600;
      const viewBox = svgEl.getAttribute('viewBox')
      if (viewBox) {
        const parts = viewBox.trim().split(/[\s,]+/)
        vbWidth = parseFloat(parts[2]) || vbWidth
        vbHeight = parseFloat(parts[3]) || vbHeight
      } else {
        const wAttr = svgEl.getAttribute('width')
        const hAttr = svgEl.getAttribute('height')
        if (wAttr && hAttr && !wAttr.includes('%') && !hAttr.includes('%')) {
          vbWidth = parseFloat(wAttr)
          vbHeight = parseFloat(hAttr)
          svgEl.setAttribute('viewBox', `0 0 ${vbWidth} ${vbHeight}`)
        }
      }
      
      svgEl.removeAttribute('width')
      svgEl.removeAttribute('height')
      
      if (svgEl.style) {
        svgEl.style.maxWidth = 'none'
        svgEl.style.height = 'auto'
      }
      
      // Set absolute pixel dimensions so it does not shrink unreadably
      svgEl.setAttribute('width', `${vbWidth}px`)
      svgEl.setAttribute('height', `${vbHeight}px`)
      svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet')
      
      const serializer = new XMLSerializer()
      const modifiedSvg = serializer.serializeToString(svgDoc)
      setSvgContent(modifiedSvg)
    } catch (err) {
      console.error('Mermaid render error:', err)
      setError('Invalid Mermaid syntax. Please check your code.')
      setSvgContent('')
    }
  }

  const handleInsertToCanvas = async () => {
    if (!canvas || !svgContent) return

    try {
      // Use SVG Data URL directly to maintain infinite vector resolution instead of rasterizing to PNG
      const svgBase64 = btoa(unescape(encodeURIComponent(svgContent)))
      const dataUrl = `data:image/svg+xml;base64,${svgBase64}`
      
      // Parse intrinsic SVG dimensions to use as the physical bounds on canvas
      const parser = new DOMParser()
      const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml')
      const svgEl = svgDoc.documentElement
      
      let svgW = 800, svgH = 600;
      const vb = svgEl.getAttribute('viewBox')
      if (vb) {
        const parts = vb.trim().split(/[\s,]+/)
        svgW = parseFloat(parts[2]) || svgW
        svgH = parseFloat(parts[3]) || svgH
      } else {
        svgW = parseFloat(svgEl.getAttribute('width')) || svgW
        svgH = parseFloat(svgEl.getAttribute('height')) || svgH
      }

      // Add to Fabric canvas natively as an SVG Image, keeping perfect crispness eternally
      fabric.Image.fromURL(dataUrl, (fabricImg) => {
        if (!fabricImg) {
          setError('Failed to create diagram image')
          return
        }
        
        // Disable object caching so scaling or zooming renders vector crisp instantly at all scales
        fabricImg.set({
          objectCaching: false,
          selectable: true,
          evented: true,
        })
        
        // Render at intrinsic SVG pixel width natively to keep labels readable natively
        fabricImg.scaleToWidth(svgW)
        
        // Center in viewport
        const vpt = canvas.viewportTransform
        const vpCenterX = (canvas.getWidth() / 2 - vpt[4]) / vpt[0]
        const vpCenterY = (canvas.getHeight() / 2 - vpt[5]) / vpt[3]
        
        fabricImg.set({
          left: vpCenterX - (fabricImg.getScaledWidth()) / 2,
          top: vpCenterY - (fabricImg.getScaledHeight()) / 2,
        })
        
        fabricImg.setCoords()
        canvas.add(fabricImg)
        canvas.setActiveObject(fabricImg)
        canvas.renderAll()
        
        // Trigger history snapshot and ensure object is selected
        setTimeout(() => {
          canvas.setActiveObject(fabricImg)
          canvas.renderAll()
          canvas.fire('object:modified')
        }, 50)
        
        onClose()
      })
      
    } catch (err) {
      console.error('Failed to insert diagram:', err)
      setError('Failed to insert diagram to canvas')
    }
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(mermaidCode)
      .then(() => alert('Code copied to clipboard!'))
      .catch(() => alert('Failed to copy code'))
  }

  const handleZoomIn = () => {
    setPreviewZoom(prev => Math.min(prev + 25, 200))
  }

  const handleZoomOut = () => {
    setPreviewZoom(prev => Math.max(prev - 25, 25))
  }

  const handleZoomReset = () => {
    setPreviewZoom(100)
  }

  if (!visible) return null

  return (
    <div className="mermaid-modal-backdrop" onClick={onClose}>
      <div 
        className={`mermaid-modal ${theme}`} 
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <div className="mermaid-modal-header">
          <h2>
            {mode === 'generate' ? 'Generate Mermaid Diagram' : 'Create Mermaid Diagram'}
          </h2>
          <button className="mermaid-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="mermaid-modal-body">
          {mode === 'create' && (
            <div className="mermaid-type-selector">
              <button
                className={selectedType === 'flowchart' ? 'active' : ''}
                onClick={() => setSelectedType('flowchart')}
              >
                Flowchart
              </button>
              <button
                className={selectedType === 'sequence' ? 'active' : ''}
                onClick={() => setSelectedType('sequence')}
              >
                Sequence
              </button>
              <button
                className={selectedType === 'class' ? 'active' : ''}
                onClick={() => setSelectedType('class')}
              >
                Class
              </button>
              <button
                className={selectedType === 'state' ? 'active' : ''}
                onClick={() => setSelectedType('state')}
              >
                State
              </button>
              <button
                className={selectedType === 'er' ? 'active' : ''}
                onClick={() => setSelectedType('er')}
              >
                ER Diagram
              </button>
              <button
                className={selectedType === 'gantt' ? 'active' : ''}
                onClick={() => setSelectedType('gantt')}
              >
                Gantt
              </button>
              <button
                className={selectedType === 'pie' ? 'active' : ''}
                onClick={() => setSelectedType('pie')}
              >
                Pie Chart
              </button>
              <button
                className={selectedType === 'bar' ? 'active' : ''}
                onClick={() => setSelectedType('bar')}
              >
                Bar Chart
              </button>
              <button
                className={selectedType === 'xy' ? 'active' : ''}
                onClick={() => setSelectedType('xy')}
              >
                XY Chart
              </button>
            </div>
          )}

          {mode === 'generate' && (
            <div className="mermaid-type-selector">
              <button
                className={generateType === 'flowchart' ? 'active' : ''}
                onClick={() => setGenerateType('flowchart')}
              >
                Flowchart
              </button>
              <button
                className={generateType === 'sequence' ? 'active' : ''}
                onClick={() => setGenerateType('sequence')}
              >
                Sequence
              </button>
              <button
                className={generateType === 'class' ? 'active' : ''}
                onClick={() => setGenerateType('class')}
              >
                Class
              </button>
              <button
                className={generateType === 'state' ? 'active' : ''}
                onClick={() => setGenerateType('state')}
              >
                State
              </button>
              <button
                className={generateType === 'er' ? 'active' : ''}
                onClick={() => setGenerateType('er')}
              >
                ER Diagram
              </button>
              <button
                className={generateType === 'gantt' ? 'active' : ''}
                onClick={() => setGenerateType('gantt')}
              >
                Gantt
              </button>
              <button
                className={generateType === 'pie' ? 'active' : ''}
                onClick={() => setGenerateType('pie')}
              >
                Pie Chart
              </button>
              <button
                className={generateType === 'bar' ? 'active' : ''}
                onClick={() => setGenerateType('bar')}
              >
                Bar Chart
              </button>
              <button
                className={generateType === 'xy' ? 'active' : ''}
                onClick={() => setGenerateType('xy')}
              >
                XY Chart
              </button>
            </div>
          )}

          <div className="mermaid-content">
            <div className="mermaid-editor">
              <div className="mermaid-editor-header">
                <span>Mermaid Code</span>
                <button className="mermaid-copy-btn" onClick={handleCopyCode}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy
                </button>
              </div>
              <textarea
                value={mermaidCode}
                onChange={e => setMermaidCode(e.target.value)}
                onKeyDown={e => e.stopPropagation()}
                placeholder="Enter Mermaid diagram code..."
                disabled={generating}
                autoFocus={mode === 'create'}
              />
            </div>

            <div className="mermaid-preview">
              <div className="mermaid-preview-header">
                <span>Preview</span>
                <div className="mermaid-zoom-controls">
                  <button 
                    className="mermaid-zoom-btn" 
                    onClick={handleZoomOut}
                    disabled={previewZoom <= 25}
                    title="Zoom Out"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.5" y2="16.5"/>
                      <line x1="8" y1="11" x2="14" y2="11"/>
                    </svg>
                  </button>
                  <span className="mermaid-zoom-level">{previewZoom}%</span>
                  <button 
                    className="mermaid-zoom-btn" 
                    onClick={handleZoomReset}
                    title="Reset Zoom"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.5" y2="16.5"/>
                    </svg>
                  </button>
                  <button 
                    className="mermaid-zoom-btn" 
                    onClick={handleZoomIn}
                    disabled={previewZoom >= 200}
                    title="Zoom In"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.5" y2="16.5"/>
                      <line x1="11" y1="8" x2="11" y2="14"/>
                      <line x1="8" y1="11" x2="14" y2="11"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div className={`mermaid-preview-content ${mermaidCode.trim().toLowerCase().startsWith('gantt') ? 'gantt-preview' : ''}`}>
                {generating && <div className="mermaid-loading">Generating...</div>}
                {error && <div className="mermaid-error">{error}</div>}
                {!generating && !error && !svgContent && (
                  <div className="mermaid-empty">Preview will appear here</div>
                )}
                {!generating && !error && svgContent && (
                  <div 
                    style={{ transform: `scale(${previewZoom / 100})` }}
                    dangerouslySetInnerHTML={{ __html: svgContent }} 
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mermaid-modal-footer">
          <button className="mermaid-btn mermaid-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="mermaid-btn mermaid-btn-primary"
            onClick={handleInsertToCanvas}
            disabled={!svgContent || generating}
          >
            Insert to Canvas
          </button>
        </div>
      </div>
    </div>
  )
}

export default MermaidModal
