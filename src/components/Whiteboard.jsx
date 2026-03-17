import { useEffect, useRef, useState, useCallback } from 'react'
import { fabric } from 'fabric'
import ShapeProperties from './ShapeProperties'
import LaserPointer from './Laserpointer'
import PresenceIndicators from './PresenceIndicators'
import './Whiteboard.css'
import { getBoard, updateBoard, getSession, getSessions, updateSession, subscribeToBoard, subscribeToSession, updatePresence as firestoreUpdatePresence, subscribeToPresence, removePresence, createBoard, createSession as firestoreCreateSession, saveUserHistorySnapshot, getUserHistory, updateUserHistoryIndex, clearUserHistory, clearAllSessionHistory, deleteUserHistorySnapshots } from '../services/firestore'

// Import realtime service to sync state
import * as realtimeService from '../services/realtime-firestore'

// Firestore realtime compatibility layer (replaces Ably)
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore'
import { db, auth } from '../services/firebase'

// Use service functions directly - no inline duplication
const initRealtime = (boardId, sessionId, onMessage) => realtimeService.initRealtime(boardId, sessionId, onMessage)
const disconnectRealtime = () => realtimeService.disconnectRealtime()
const requestSync = () => realtimeService.requestSync()
const getClientId = () => realtimeService.getClientId()
const publishFullCanvas = (data) => realtimeService.publishFullCanvas(data)
const publishClear = (data) => realtimeService.publishClear(data)
const enterPresence = (userData) => realtimeService.enterPresence(userData)
const updatePresence = (userData) => realtimeService.updatePresence(userData)
const onPresenceChange = (callback) => realtimeService.onPresenceChange(callback)
const getPresenceMembers = () => realtimeService.getPresenceMembers()
const isRealtimeConnected = () => realtimeService.isRealtimeConnected()
const publishViewportSync = (viewport) => realtimeService.publishViewportSync(viewport)
const onViewportSync = (callback) => realtimeService.onViewportSync(callback)
const setViewportSyncEnabled = (enabled) => realtimeService.setViewportSyncEnabled(enabled)
const publishSelection = (objectId) => realtimeService.publishSelection(objectId)


const SHAPE_TYPES = ['rect', 'circle', 'triangle', 'polygon', 'ellipse', 'group', 'i-text', 'textbox', 'image']
const FONTS = ['DM Sans', 'Arial', 'Georgia', 'Courier New', 'Verdana', 'Times New Roman', 'Trebuchet MS']

const SERIALIZE_PROPS = [
  'id', // Unique identifier for merge conflict resolution
  'createdBy', // User email who created this object (for per-user undo/redo)
  'selectable', 'evented',
  'perPixelTargetFind', 'strokeUniform', 'hasControls', 'hasBorders',
  'shadow', 'rx', 'ry', 'isEraserStroke', 'isFrame', 'src', 'crossOrigin',
  'isPlaceholder', 'placeholderText', 'editable',
  'isStickyNote', 'isStickyText',
  'fill', 'stroke', 'strokeWidth', 'strokeLineCap', 'opacity',
  'text', // Text content for textbox/i-text objects
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', // Text formatting
  'textAlign', 'lineHeight', 'charSpacing', // Text layout
  'fillPatternType', // Custom property to track pattern type (hatch, cross, dots)
  'fillPatternColor', // Color used for the pattern
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

const resolveSessionId = () => {
  // Check URL for shared session
  const params = new URLSearchParams(window.location.search)
  const sharedSessionId = params.get('session')
  return sharedSessionId || null
}

// Save canvas to Neon database (session-specific)
const saveToSessionApi = debounce(async (boardId, sessionId, canvasJson, background) => {
  try {
    if (!sessionId) {
      console.warn('[saveToSessionApi] No sessionId - cannot save')
      return
    }
    console.log('[saveToSessionApi] Saving to session:', sessionId, 'Objects:', canvasJson?.objects?.length || 0)
    await updateSession(boardId, sessionId, { canvasJson, background })
    console.log('[saveToSessionApi] Save successful')
  } catch (err) {
    console.warn('[saveToSessionApi] Session save failed:', err.message)
  }
}, 300) // Reduced to 300ms for faster database saves and real-time feel

// Immediate save (no debounce) for critical operations like clear
const saveToSessionImmediate = async (boardId, sessionId, canvasJson, background) => {
  try {
    if (!sessionId) {
      console.warn('[saveToSessionImmediate] No sessionId - cannot save')
      return
    }
    console.log('[saveToSessionImmediate] Saving to session:', sessionId, 'Objects:', canvasJson?.objects?.length || 0)
    await updateSession(boardId, sessionId, { canvasJson, background })
    console.log('[saveToSessionImmediate] Save successful')
  } catch (err) {
    console.warn('[saveToSessionImmediate] Session save failed:', err.message)
  }
}

// Helper: Serialize canvas JSON and strip pattern objects to prevent serialization errors
const getSerializedCanvas = (canvas) => {
  const json = canvas.toJSON(SERIALIZE_PROPS)
  
  if (json.objects) {
    // Strip remote selection overlays
    json.objects = json.objects.filter(obj => !obj.isRemoteSelection)
    // Strip pattern fills (can't be serialized)
    json.objects.forEach(obj => {
      if (obj.fill && typeof obj.fill === 'object' && obj.fill !== null) {
        obj.fill = 'transparent'
      }
    })
  }
  
  return json
}

const serializeCanvas = (canvas, sessionIdRef) => {
  try {
    const json = getSerializedCanvas(canvas)
    
    const boardId = resolveBoardId()
    const sessionId = sessionIdRef.current

    if (boardId && sessionId) {
      // Save to session in database
      saveToSessionApi(boardId, sessionId, json, canvas.backgroundColor || '#ffffff')
    } else {
      console.warn('[Whiteboard] No boardId or sessionId found - cannot save')
    }
  } catch (err) {
    console.warn('[Whiteboard] Save failed:', err)
  }
}

// Helper: merge objects by ID to handle concurrent edits without data loss
const mergeCanvasObjects = (canvas, newCanvasJson, isMutingRef, onDone) => {
  if (!canvas || !canvas.lowerCanvasEl) {
    if (onDone) onDone()
    return
  }
  
  if (isMutingRef) isMutingRef.current = true
  
  // Pre-process: Remove any pattern objects from incoming JSON
  if (newCanvasJson.objects) {
    newCanvasJson.objects.forEach(obj => {
      if (obj.fill && typeof obj.fill === 'object' && obj.fill !== null) {
        console.log('[mergeCanvasObjects] Stripping pattern object from incoming JSON:', obj.type)
        obj.fill = 'transparent'
      }
    })
  }
  
  const currentObjects = canvas.getObjects()
  const newObjects = newCanvasJson.objects || []
  
  // Build a map of current objects by ID
  const currentMap = {}
  currentObjects.forEach(obj => {
    if (obj.id) {
      currentMap[obj.id] = obj
    }
  })
  
  // Build a map of new objects by ID
  const newMap = {}
  newObjects.forEach(obj => {
    if (obj.id) {
      newMap[obj.id] = obj
    }
  })
  
  let addedCount = 0
  let updatedCount = 0
  let removedCount = 0
  
  // Remove objects that are in current canvas but NOT in new canvas
  // This handles undo/delete operations from other users
  const objectsToRemove = []
  currentObjects.forEach(obj => {
    if (obj.id && !newMap[obj.id]) {
      objectsToRemove.push(obj)
    }
  })
  
  objectsToRemove.forEach(obj => {
    console.log('[mergeCanvasObjects] Removing object:', obj.id, 'created by:', obj.createdBy)
    if (obj.stickyText) canvas.remove(obj.stickyText)
    if (obj.stickyRect) canvas.remove(obj.stickyRect)
    canvas.remove(obj)
    removedCount++
  })
  
  // Build a set of object IDs currently inside an active selection (their left/top
  // are selection-relative, not canvas-absolute — updating them would cause jumping)
  const activeSelectionIds = new Set()
  const activeObj = canvas.getActiveObject()
  if (activeObj && activeObj.type === 'activeSelection') {
    activeObj.getObjects().forEach(o => { if (o.id) activeSelectionIds.add(o.id) })
  }

  // Add or update objects from new canvas
  newObjects.forEach(newObj => {
    if (newObj.id && currentMap[newObj.id]) {
      // Skip objects currently inside an active selection — their coords are
      // selection-relative and updating them would cause a position jump
      if (activeSelectionIds.has(newObj.id)) return

      // Object exists - update it only if it looks different
      const existingObj = currentMap[newObj.id]
      const needsUpdate = (
        existingObj.left !== newObj.left ||
        existingObj.top !== newObj.top ||
        existingObj.scaleX !== newObj.scaleX ||
        existingObj.scaleY !== newObj.scaleY ||
        existingObj.angle !== newObj.angle ||
        existingObj.fill !== newObj.fill ||
        existingObj.stroke !== newObj.stroke ||
        existingObj.text !== newObj.text // Check text content changes
      )
      
      if (needsUpdate) {
        // Recreate pattern if needed
        let fillToApply = newObj.fill
        if (newObj.fillPatternType && newObj.fillPatternType !== 'solid') {
          try {
            const patternCanvas = document.createElement('canvas')
            patternCanvas.width = 10
            patternCanvas.height = 10
            const ctx = patternCanvas.getContext('2d')
            
            if (!ctx) {
              console.error('[mergeCanvasObjects] Failed to get 2d context for pattern')
              fillToApply = 'transparent'
            } else {
              const patternColor = newObj.fillPatternColor || newObj.stroke || '#000000'
              ctx.strokeStyle = patternColor
              ctx.fillStyle = patternColor
              ctx.lineWidth = 1

              if (newObj.fillPatternType === 'hatch') {
                ctx.beginPath()
                ctx.moveTo(0, 10)
                ctx.lineTo(10, 0)
                ctx.stroke()
              } else if (newObj.fillPatternType === 'cross') {
                ctx.beginPath()
                ctx.moveTo(0, 10)
                ctx.lineTo(10, 0)
                ctx.moveTo(0, 0)
                ctx.lineTo(10, 10)
                ctx.stroke()
              } else if (newObj.fillPatternType === 'dots') {
                ctx.beginPath()
                ctx.arc(5, 5, 1.5, 0, Math.PI * 2)
                ctx.fill()
              }

              fillToApply = new fabric.Pattern({
                source: patternCanvas,
                repeat: 'repeat'
              })
              console.log('[mergeCanvasObjects] Recreated pattern for update:', newObj.fillPatternType)
            }
          } catch (err) {
            console.error('[mergeCanvasObjects] Failed to create pattern:', err)
            fillToApply = 'transparent'
          }
        }
        
        existingObj.set({
          left: newObj.left,
          top: newObj.top,
          scaleX: newObj.scaleX,
          scaleY: newObj.scaleY,
          angle: newObj.angle,
          fill: fillToApply,
          stroke: newObj.stroke,
          strokeWidth: newObj.strokeWidth,
          opacity: newObj.opacity,
          fillPatternType: newObj.fillPatternType,
          fillPatternColor: newObj.fillPatternColor,
          text: newObj.text, // Update text content
          fontSize: newObj.fontSize,
          fontFamily: newObj.fontFamily,
          fontWeight: newObj.fontWeight,
          fontStyle: newObj.fontStyle,
        })
        existingObj.setCoords()
        updatedCount++
      }
    } else {
      // New object - add it
      fabric.util.enlivenObjects([newObj], function(enlivenedObjects) {
        enlivenedObjects.forEach(obj => {
          // Recreate fill patterns if fillPatternType is set
          if (obj.fillPatternType && obj.fillPatternType !== 'solid') {
            try {
              const patternCanvas = document.createElement('canvas')
              patternCanvas.width = 10
              patternCanvas.height = 10
              const ctx = patternCanvas.getContext('2d')
              
              if (!ctx) {
                console.error('[mergeCanvasObjects] Failed to get 2d context for pattern')
                obj.set({ fill: 'transparent' })
              } else {
                const patternColor = obj.fillPatternColor || obj.stroke || '#000000'
                ctx.strokeStyle = patternColor
                ctx.fillStyle = patternColor
                ctx.lineWidth = 1

                if (obj.fillPatternType === 'hatch') {
                  ctx.beginPath()
                  ctx.moveTo(0, 10)
                  ctx.lineTo(10, 0)
                  ctx.stroke()
                } else if (obj.fillPatternType === 'cross') {
                  ctx.beginPath()
                  ctx.moveTo(0, 10)
                  ctx.lineTo(10, 0)
                  ctx.moveTo(0, 0)
                  ctx.lineTo(10, 10)
                  ctx.stroke()
                } else if (obj.fillPatternType === 'dots') {
                  ctx.beginPath()
                  ctx.arc(5, 5, 1.5, 0, Math.PI * 2)
                  ctx.fill()
                }

                const pattern = new fabric.Pattern({
                  source: patternCanvas,
                  repeat: 'repeat'
                })
                obj.set({ fill: pattern })
                console.log('[mergeCanvasObjects] Recreated pattern:', obj.fillPatternType, 'for object:', obj.id)
              }
            } catch (err) {
              console.error('[mergeCanvasObjects] Failed to create pattern:', err)
              obj.set({ fill: 'transparent' })
            }
          }
          
          canvas.add(obj)
          if (obj.type === 'line') {
            normalizeLineOrigin(obj)
            obj.set({ perPixelTargetFind: true, hasBorders: false })
            applyLineControls(obj)
          }
          addedCount++
        })
        // Re-apply z-order after async add to keep newly added objects in correct position
        newObjects.forEach((nObj, targetIndex) => {
          if (!nObj.id) return
          const canvasObjs = canvas.getObjects()
          const found = canvasObjs.find(o => o.id === nObj.id)
          if (!found) return
          const currentIndex = canvasObjs.indexOf(found)
          if (currentIndex !== targetIndex) canvas.moveTo(found, targetIndex)
        })
        canvas.requestRenderAll()
      }, null)
    }
  })
  
  // Restore z-order for existing objects to match the incoming canvas
  newObjects.forEach((newObj, targetIndex) => {
    if (!newObj.id) return
    const existingObj = currentMap[newObj.id]
    if (!existingObj) return
    const currentIndex = canvas.getObjects().indexOf(existingObj)
    if (currentIndex !== targetIndex) {
      canvas.moveTo(existingObj, targetIndex)
    }
  })

  if (addedCount > 0 || updatedCount > 0 || removedCount > 0) {
    console.log('[mergeCanvasObjects] Merged: ' + addedCount + ' added, ' + updatedCount + ' updated, ' + removedCount + ' removed')
  }
  
  canvas.requestRenderAll()
  if (isMutingRef) isMutingRef.current = false
  onDone()
}

// Helper: load JSON into the canvas and restore object state
const loadJsonIntoCanvas = (canvas, parsed, isMutingRef, onDone) => {
  // Check if canvas is still valid (not disposed)
  if (!canvas || !canvas.lowerCanvasEl) {
    if (onDone) onDone()
    return
  }
  
  // Pre-process JSON to remove any pattern objects before Fabric.js tries to deserialize them
  if (parsed.objects) {
    parsed.objects.forEach(obj => {
      if (obj.fill && typeof obj.fill === 'object' && obj.fill !== null) {
        console.log('[loadJsonIntoCanvas] Stripping pattern object from JSON before load:', obj.type)
        obj.fill = 'transparent'
      }
    })
  }
  
  // Suppress onMutation firing during load
  if (isMutingRef) isMutingRef.current = true

  // Capture the intended z-order from the JSON before async image loads scramble it
  const intendedOrder = (parsed.objects || []).map(o => o.id).filter(Boolean)

  // Helper to restore z-order by ID
  const restoreZOrder = () => {
    if (intendedOrder.length === 0) return
    const idToObj = {}
    canvas.getObjects().forEach(obj => { if (obj.id) idToObj[obj.id] = obj })
    intendedOrder.forEach((id, targetIndex) => {
      const obj = idToObj[id]
      if (!obj) return
      const currentIndex = canvas.getObjects().indexOf(obj)
      if (currentIndex !== targetIndex) canvas.moveTo(obj, targetIndex)
    })
    canvas.requestRenderAll()
  }

  canvas.loadFromJSON(parsed, () => {
    const objs = canvas.getObjects()

    // Re-apply correct z-order immediately after loadFromJSON callback
    restoreZOrder()

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
      
      // Recreate fill patterns if fillPatternType is set
      if (obj.fillPatternType && obj.fillPatternType !== 'solid') {
        try {
          const patternCanvas = document.createElement('canvas')
          patternCanvas.width = 10
          patternCanvas.height = 10
          const ctx = patternCanvas.getContext('2d')
          
          if (!ctx) {
            console.error('[loadJsonIntoCanvas] Failed to get 2d context for pattern')
            obj.set({ fill: 'transparent' })
            return
          }
          
          const patternColor = obj.fillPatternColor || obj.stroke || '#000000'
          ctx.strokeStyle = patternColor
          ctx.fillStyle = patternColor
          ctx.lineWidth = 1

          if (obj.fillPatternType === 'hatch') {
            ctx.beginPath()
            ctx.moveTo(0, 10)
            ctx.lineTo(10, 0)
            ctx.stroke()
          } else if (obj.fillPatternType === 'cross') {
            ctx.beginPath()
            ctx.moveTo(0, 10)
            ctx.lineTo(10, 0)
            ctx.moveTo(0, 0)
            ctx.lineTo(10, 10)
            ctx.stroke()
          } else if (obj.fillPatternType === 'dots') {
            ctx.beginPath()
            ctx.arc(5, 5, 1.5, 0, Math.PI * 2)
            ctx.fill()
          }

          const pattern = new fabric.Pattern({
            source: patternCanvas,
            repeat: 'repeat'
          })
          obj.set({ fill: pattern })
          console.log('[loadJsonIntoCanvas] Recreated pattern:', obj.fillPatternType, 'for object:', obj.id)
        } catch (err) {
          console.error('[loadJsonIntoCanvas] Failed to recreate pattern:', err)
          obj.set({ fill: 'transparent' })
        }
      }
      
      // Ensure stroke paths have minimum width for visibility
      if (obj.type === 'path' && obj.stroke && obj.strokeWidth < 1) {
        obj.set({ strokeWidth: 1.5 })
      }
      
      if (obj.type === 'line') {
        // Clean up any previously-saved highlight color (#1a73e8) — restore to black.
        // This fixes lines that were accidentally saved while selected (old bug).
        if (obj.stroke === '#1a73e8') {
          obj.set({ stroke: '#000000' })
        }
        normalizeLineOrigin(obj)
        obj.set({ perPixelTargetFind: true, hasBorders: false, borderColor: 'transparent' })
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
    
    canvas.requestRenderAll()

    // Re-apply z-order after a short delay to catch async image loads that fire after the callback
    setTimeout(() => {
      if (!canvas || !canvas.lowerCanvasEl) return
      restoreZOrder()
    }, 300)

    if (isMutingRef) isMutingRef.current = false
    onDone()
  }, (o, fabricObj) => { if (fabricObj) fabricObj.setCoords() })
}

// Load canvas data from Neon database (session-specific)
const deserializeCanvas = (canvas, isMutingRef, sessionId, onDone) => {
  const boardId = resolveBoardId()

  console.log('[deserializeCanvas] ========== LOADING SESSION ==========')
  console.log('[deserializeCanvas] Board ID:', boardId)
  console.log('[deserializeCanvas] Session ID:', sessionId)

  if (!boardId) {
    console.warn('[deserializeCanvas] No boardId found - user not authenticated')
    onDone()
    return
  }

  if (!sessionId) {
    // Try to get sessionId from URL as fallback
    const urlSessionId = resolveSessionId()
    if (urlSessionId) {
      console.log('[deserializeCanvas] No sessionId prop, using URL sessionId:', urlSessionId)
      return deserializeCanvas(canvas, isMutingRef, urlSessionId, onDone)
    }
    console.warn('[deserializeCanvas] No sessionId found - cannot load')
    onDone()
    return
  }

  console.log('[deserializeCanvas] Loading session from database:', sessionId)

  // Load from Neon database with retry logic
  const loadWithRetry = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const data = await getSession(boardId, sessionId)
        return data
      } catch (err) {
        console.warn(`[Whiteboard] Session load attempt ${i + 1}/${retries} failed:`, err.message)
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
    .then((session) => {
      const canvasJson = session.canvasJson
      const background = session.background
      
      console.log('[Whiteboard] Session loaded successfully. Objects count:', canvasJson?.objects?.length || 0, 'Background:', background)
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
        console.log('[Whiteboard] No canvas data in session - starting with empty canvas')
        onDone()
      }
    })
    .catch(err => {
      console.error('[Whiteboard] Session load failed after retries:', err.message, '- Starting with empty canvas')
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
  const barRef = useRef(null)
  const BAR_HEIGHT = 34
  const BAR_WIDTH = 260
  const MARGIN = 8

  // Use direct DOM manipulation for smooth position updates during drag
  useEffect(() => {
    if (!barRef.current || !position) return
    
    let left = position.left
    let top = position.top - BAR_HEIGHT - MARGIN

    if (left + BAR_WIDTH > window.innerWidth - MARGIN) left = window.innerWidth - BAR_WIDTH - MARGIN
    if (left < MARGIN) left = MARGIN
    if (top < MARGIN) top = position.top + position.height + MARGIN

    // Use transform for smoother updates (no layout recalculation)
    barRef.current.style.transform = `translate(${left}px, ${top}px)`
  }, [position])

  const barStyle = {
    position: 'fixed', 
    left: 0, 
    top: 0,
    transform: 'translate(0, 0)', // Initial position, will be updated by useEffect
    display: 'flex', alignItems: 'center', gap: 2,
    height: 30, padding: '0 6px',
    background: '#fff', border: '1px solid #d1d5db',
    borderRadius: 7, boxShadow: '0 2px 8px rgba(0,0,0,0.13)',
    zIndex: 9999, userSelect: 'none', fontSize: 11,
    willChange: 'transform', // Hint to browser for optimization
    visibility: position ? 'visible' : 'hidden', // Hide until position is set
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
    <div ref={barRef} style={barStyle} onMouseDown={e => e.stopPropagation()}>
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

// ── Normalize line origin to 'center' (fixes lines saved with old originX:'left') ──
const normalizeLineOrigin = (obj) => {
  if (obj.type !== 'line') return
  if (obj.originX !== 'center' || obj.originY !== 'center') {
    // Fabric saves x1/y1/x2/y2 as center-relative offsets; left/top is the old origin.
    // With originX:'left', left=min(x1,x2) in canvas space. Midpoint = left + width/2.
    obj.set({
      originX: 'center', originY: 'center',
      left: obj.left + (obj.width || 0) / 2,
      top: obj.top + (obj.height || 0) / 2,
    })
  }
}

// ── Line endpoint controls ───────────────────────────────────────────────────
const applyLineControls = (line) => {
  // In Fabric.js, a Line's x1/y1/x2/y2 are stored relative to the line's
  // own origin (left/top = midpoint when originX:'center'). So the absolute
  // canvas position of endpoint p1 is (left + x1, top + y1).
  const linePositionHandler = (pointKey) => function (_dim, _finalMatrix, fabricObject) {
    const canvas = fabricObject.canvas
    if (!canvas) return new fabric.Point(0, 0)

    // calcLinePoints() returns offsets from the midpoint (left/top) in unscaled coords.
    // With originX:'center', left/top IS the midpoint, so left + offset = absolute endpoint.
    const pts = fabricObject.calcLinePoints()
    const x = (pointKey === 'p1' ? pts.x1 : pts.x2) + fabricObject.left
    const y = (pointKey === 'p1' ? pts.y1 : pts.y2) + fabricObject.top

    return fabric.util.transformPoint({ x, y }, canvas.viewportTransform)
  }

  const lineActionHandler = (pointKey) => function (_evt, transform, x, y) {
    const fabricObject = transform.target
    const canvas = fabricObject.canvas
    if (!canvas) return false

    // Screen → canvas coords
    const pt = fabric.util.transformPoint(
      { x, y },
      fabric.util.invertTransform(canvas.viewportTransform)
    )

    // Get the current absolute positions of both endpoints
    const pts = fabricObject.calcLinePoints()
    const absX1 = fabricObject.left + pts.x1
    const absY1 = fabricObject.top + pts.y1
    const absX2 = fabricObject.left + pts.x2
    const absY2 = fabricObject.top + pts.y2

    // Update the dragged endpoint to the new position
    const newX1 = pointKey === 'p1' ? pt.x : absX1
    const newY1 = pointKey === 'p1' ? pt.y : absY1
    const newX2 = pointKey === 'p2' ? pt.x : absX2
    const newY2 = pointKey === 'p2' ? pt.y : absY2

    // New midpoint
    const newMidX = (newX1 + newX2) / 2
    const newMidY = (newY1 + newY2) / 2

    // Temporarily disable _setWidthHeight side-effects by setting directly
    fabricObject.x1 = newX1 - newMidX
    fabricObject.y1 = newY1 - newMidY
    fabricObject.x2 = newX2 - newMidX
    fabricObject.y2 = newY2 - newMidY
    fabricObject.left = newMidX
    fabricObject.top = newMidY
    fabricObject.width = Math.abs(newX2 - newX1)
    fabricObject.height = Math.abs(newY2 - newY1)
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
  line.set({ hasControls: true, hasBorders: false, borderColor: 'transparent', padding: 6 })

  // Completely suppress the selection bounding box for lines
  line.drawBorders = function() { return this }
  line._renderControls = function(ctx, styleOverride) {
    const so = Object.assign({}, styleOverride || {}, { hasBorders: false, borderColor: 'transparent' })
    fabric.Object.prototype._renderControls.call(this, ctx, so)
  }
}

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
  onBoardIdChange, currentSessionId, onSessionIdChange, user,
}) => {
  console.log('[Whiteboard] Component render - user:', user ? `${user.name} (${user.email})` : 'NULL')
  console.log('[Whiteboard] Component render - currentSessionId:', currentSessionId)
  
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
  // Track when we last saved to database
  const lastSaveTimeRef = useRef(0)
  // Track if user is actively editing text
  const isEditingTextRef = useRef(false)
  // Store currentSessionId in ref for use in callbacks
  const currentSessionIdRef = useRef(currentSessionId)
  // Timeout ref for editing indicator
  const editingTimeoutRef = useRef(null)

  const historyRef = useRef([])
  const historyIdxRef = useRef(-1)
  const isMutingRef = useRef(false)

  // Update ref when prop changes
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId
  }, [currentSessionId])

  const [selectedObject, setSelectedObject] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [textFormat, setTextFormat] = useState({ fontSize: 20, fontFamily: 'DM Sans', bold: false, italic: false })
  const [showTextBar, setShowTextBar] = useState(false)
  const [textBarPosition, setTextBarPosition] = useState(null)

  const fillRef = useRef(fillShape)
  const colorRef = useRef(color)
  const strokeRef = useRef(strokeWidth)
  const toolRef = useRef(tool)
  const onMutationRef = useRef(null) // set once onMutation is defined inside the canvas useEffect
  const broadcastCanvasRef = useRef(null) // set once broadcastCanvas is defined inside the canvas useEffect

  useEffect(() => { fillRef.current = fillShape }, [fillShape])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { strokeRef.current = strokeWidth }, [strokeWidth])
  useEffect(() => { toolRef.current = tool }, [tool])

  // Apply color change to currently selected object(s)
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const active = canvas.getActiveObject()
    if (!active) return

    const targets = active.type === 'activeSelection'
      ? active.getObjects()
      : [active]

    let changed = false
    targets.forEach(obj => {
      if (obj.isEraserStroke || obj.isFrame) return
      if (obj.type === 'path' || obj.type === 'line') {
        obj.set({ stroke: color })
      } else {
        obj.set({ stroke: color })
        if (fillRef.current && obj.fill !== 'rgba(255,255,255,0.01)') {
          obj.set({ fill: color })
        }
      }
      obj.setCoords()
      changed = true
    })

    if (changed) {
      canvas.requestRenderAll()
      onMutationRef.current?.()
    }
  }, [color]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply fill toggle to currently selected object(s)
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const active = canvas.getActiveObject()
    if (!active) return

    const targets = active.type === 'activeSelection'
      ? active.getObjects()
      : [active]

    let changed = false
    targets.forEach(obj => {
      if (obj.isEraserStroke || obj.isFrame || obj.type === 'path' || obj.type === 'line') return
      if (fillShape) {
        obj.set({ fill: colorRef.current })
      } else {
        obj.set({ fill: 'rgba(255,255,255,0.01)' })
      }
      obj.setCoords()
      changed = true
    })

    if (changed) {
      canvas.requestRenderAll()
      onMutationRef.current?.()
    }
  }, [fillShape]) // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent about boardId when component mounts
  useEffect(() => {
    const boardId = resolveBoardId()
    if (boardId && onBoardIdChange) {
      onBoardIdChange(boardId)
    }
  }, [onBoardIdChange])

  // Load current session ID from URL ONLY on initial mount
  useEffect(() => {
    const boardId = resolveBoardId()
    const urlSessionId = resolveSessionId()
    
    // Only set session from URL if we don't have a currentSessionId yet
    if (urlSessionId && onSessionIdChange && !currentSessionId) {
      console.log('[Whiteboard] Using session from URL on initial load:', urlSessionId)
      onSessionIdChange(urlSessionId)
      window.dispatchEvent(new CustomEvent('wb-session-changed', {
        detail: { sessionId: urlSessionId }
      }))
      return
    }
    
    // Otherwise load from Firestore
    if (boardId && onSessionIdChange && !currentSessionId) {
      // Get sessions from Firestore
      getSessions(boardId).then((sessions) => {
        // Use first session if available
        if (sessions.length > 0) {
          console.log('[Whiteboard] Using first session from Firestore:', sessions[0].id)
          onSessionIdChange(sessions[0].id)
          window.dispatchEvent(new CustomEvent('wb-session-changed', {
            detail: { sessionId: sessions[0].id }
          }))
        }
      }).catch(err => {
        console.warn('[Whiteboard] Failed to load sessions:', err)
      })
    }
  }, [currentSessionId, onSessionIdChange])

  // Emit event when session changes
  useEffect(() => {
    if (currentSessionId) {
      window.dispatchEvent(new CustomEvent('wb-session-changed', {
        detail: { sessionId: currentSessionId }
      }))
    }
  }, [currentSessionId])

  // Track if we're in the middle of an undo/redo to prevent history reload
  const isUndoRedoInProgressRef = useRef(false)

  // Load user history when session changes
  useEffect(() => {
    const boardId = resolveBoardId()
    
    if (!boardId || !currentSessionId || !user?.email) {
      console.log('[Whiteboard] Skipping history load - boardId:', boardId, 'session:', currentSessionId, 'user:', user?.email)
      return
    }
    
    // Don't reload history if we're in the middle of undo/redo
    if (isUndoRedoInProgressRef.current) {
      console.log('[Whiteboard] Skipping history load - undo/redo in progress')
      return
    }
    
    const userEmail = user.email
    console.log('[Whiteboard] Loading history for:', userEmail, 'session:', currentSessionId)
    
    getUserHistory(boardId, currentSessionId, userEmail)
      .then(historyData => {
        console.log('[Whiteboard] History loaded:', historyData.snapshots?.length || 0, 'snapshots')
        
        if (historyData.snapshots && historyData.snapshots.length > 0) {
          historyRef.current = historyData.snapshots
          historyIdxRef.current = historyData.currentIndex
          
          // Ensure index is within bounds
          if (historyIdxRef.current < -1) historyIdxRef.current = -1
          if (historyIdxRef.current >= historyData.snapshots.length) historyIdxRef.current = historyData.snapshots.length - 1
          
          // Calculate button states for current user
          const userSnapshots = historyData.snapshots.filter(s => s.userEmail === userEmail)
          
          // Find current position in user's history
          let currentUserIdx = -1
          if (historyIdxRef.current >= 0) {
            const currentSnapshot = historyData.snapshots[historyIdxRef.current]
            currentUserIdx = userSnapshots.indexOf(currentSnapshot)
          }
          
          // Can undo if we're at any snapshot (including first one to get to empty)
          // Can't undo if we're already at empty canvas (index -1)
          const canUndo = historyIdxRef.current >= 0 && userSnapshots.length > 0
          const canRedo = currentUserIdx < userSnapshots.length - 1
          
          console.log('[Whiteboard] History button states - canUndo:', canUndo, 'canRedo:', canRedo, 'currentIndex:', historyIdxRef.current, 'currentUserIdx:', currentUserIdx, 'total:', historyData.snapshots.length, 'userSnapshots:', userSnapshots.length)
          
          // Update button states
          onHistoryChange?.({ canUndo, canRedo })
          
          console.log(`[Whiteboard] ✓ Restored ${historyData.snapshots.length} snapshots for ${userEmail}`)
        } else {
          console.log('[Whiteboard] No history found in Firestore')
          // Reset history state
          historyRef.current = []
          historyIdxRef.current = -1
          onHistoryChange?.({ canUndo: false, canRedo: false })
        }
      })
      .catch(err => {
        console.error('[Whiteboard] Failed to load history from Firestore:', err)
        // Reset history state on error
        historyRef.current = []
        historyIdxRef.current = -1
        onHistoryChange?.({ canUndo: false, canRedo: false })
      })
  }, [currentSessionId, user?.email, onHistoryChange])

  // Initialize/reinitialize realtime connection when sessionId or user changes
  useEffect(() => {
    const boardId = resolveBoardId()
    console.log('[Whiteboard] Realtime useEffect triggered')
    console.log('[Whiteboard]   - boardId:', boardId)
    console.log('[Whiteboard]   - user:', user ? `${user.name} (${user.email})` : 'null')
    console.log('[Whiteboard]   - currentSessionId:', currentSessionId)
    
    if (!boardId || !user) {
      console.log('[Whiteboard] Skipping realtime init - boardId:', boardId, 'user:', user?.name)
      return
    }

    console.log('[Whiteboard] Initializing realtime for session:', currentSessionId || '(none)', 'user:', user.name)
    
    // Track if this effect is still active
    let isActive = true
    
    // Initialize realtime (initRealtime handles disconnecting if already connected)
    initRealtime(boardId, currentSessionId, (msg) => {
        // Handle messages (this is the same handler as before)
        if (!msg) return
        console.log('[Whiteboard] Received realtime message:', msg.type)
        
        const currentCanvas = fabricRef.current
        if (!currentCanvas) return

        // Handle canvas:clear
        if (msg.type === 'canvas:clear') {
          isMutingRef.current = true
          currentCanvas.getObjects().slice().forEach(o => currentCanvas.remove(o))
          const bg = msg.background || '#ffffff'
          currentCanvas.setBackgroundColor(bg, () => {
            if (currentCanvas.lowerCanvasEl) currentCanvas.renderAll()
          })
          isMutingRef.current = false
          return
        }

        // Handle canvas:full
        if (msg.type === 'canvas:full' && msg.canvasJson) {
          // Skip if we're in the middle of an undo/redo operation
          if (realtimeIgnoreRef.current) {
            console.log('[Whiteboard] Ignoring canvas:full - undo/redo in progress')
            return
          }
          
          const bgToApply = msg.background
          realtimeIgnoreRef.current = true
          mergeCanvasObjects(currentCanvas, msg.canvasJson, isMutingRef, () => {
            if (bgToApply && currentCanvas.lowerCanvasEl) {
              currentCanvas.setBackgroundColor(bgToApply, () => currentCanvas.requestRenderAll())
            } else {
              currentCanvas.requestRenderAll()
            }
            realtimeIgnoreRef.current = false
          })
          return
        }

        // Handle sync:request
        if (msg.type === 'sync:request') {
          if (currentCanvas && currentCanvas.lowerCanvasEl) {
            publishFullCanvas({
              type: 'canvas:full',
              canvasJson: getSerializedCanvas(currentCanvas),
              background: currentCanvas.backgroundColor || '#ffffff'
            })
          }
        }
      })
    .then(() => {
      // Only proceed if this effect is still active
      if (!isActive) {
        console.log('[Whiteboard] Effect cancelled, skipping presence enter')
        return
      }
      
      // Enter presence
      console.log('[Whiteboard] About to enter presence with:', user.name, user.email)
      return enterPresence({
        name: user.name,
        email: user.email,
        isEditing: false
      })
    })
    .then(() => {
      if (!isActive) return
      console.log('[Whiteboard] Successfully entered presence')

      // Heartbeat: keep lastSeen fresh so viewers don't get filtered out as stale
      const heartbeatInterval = setInterval(() => {
        if (!isActive) return
        updatePresence({
          name: user.name,
          email: user.email,
          isEditing: false
        })
      }, 30000) // every 30 seconds
      window._presenceHeartbeat = heartbeatInterval
      
      // Subscribe to viewport sync
      const unsubViewport = onViewportSync((data) => {
        const currentCanvas = fabricRef.current
        if (!currentCanvas || !currentCanvas.lowerCanvasEl) return
        
        console.log('[Whiteboard] Received viewport sync:', data)
        
        // Temporarily disable viewport sync to prevent echo
        setViewportSyncEnabled(false)
        
        const vpt = currentCanvas.viewportTransform.slice()
        vpt[0] = data.zoom
        vpt[3] = data.zoom
        vpt[4] = data.panX
        vpt[5] = data.panY
        
        currentCanvas.setViewportTransform(vpt)
        currentCanvas.renderAll()
        
        console.log('[Whiteboard] Applied viewport sync - zoom:', data.zoom, 'pan:', data.panX, data.panY)
        
        // Re-enable after a short delay
        setTimeout(() => {
          setViewportSyncEnabled(true)
        }, 200)
      })
      
      window._unsubViewport = unsubViewport
    })
    .catch(err => {
      if (!isActive) return
      console.error('[Whiteboard] Realtime init failed:', err)
      console.error('[Whiteboard] Error details:', err.message, err.stack)
    })

    return () => {
      // Mark effect as inactive
      isActive = false
      
      // Cleanup heartbeat
      if (window._presenceHeartbeat) {
        clearInterval(window._presenceHeartbeat)
        window._presenceHeartbeat = null
      }

      // Cleanup viewport subscription
      if (window._unsubViewport) {
        window._unsubViewport()
        window._unsubViewport = null
      }
      
      // Note: We don't disconnect realtime here because:
      // 1. React StrictMode causes double-mount which would disconnect prematurely
      // 2. initRealtime() handles switching channels automatically
      // 3. Disconnection happens in the main component cleanup (see below)
    }
  }, [currentSessionId, user])

  const pushSnapshot = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas || isMutingRef.current) return
    // Don't push if canvas is disposed (StrictMode cleanup)
    if (!canvas.lowerCanvasEl || !canvas.wrapperEl) return
    
    // Don't create snapshots for changes from realtime sync (other users)
    if (realtimeIgnoreRef.current) {
      console.log('[pushSnapshot] Skipping snapshot - change from realtime sync')
      return
    }
    
    const json = getSerializedCanvas(canvas)
    
    // Tag all current objects with the current user's email if not already tagged
    const userEmail = user?.email || 'anonymous'
    canvas.getObjects().forEach(obj => {
      if (!obj.createdBy) {
        obj.createdBy = userEmail
      }
    })
    
    // Create snapshot with user metadata for per-user undo/redo
    const snapshot = {
      canvasJson: json,
      userEmail: userEmail,
      timestamp: Date.now(),
      // Track which object IDs were present in this snapshot
      objectIds: json.objects?.map(o => o.id).filter(Boolean) || []
    }
    
    // Avoid duplicate consecutive snapshots (prevents double-click-to-undo issue)
    const prev = historyRef.current[historyIdxRef.current]
    if (prev && JSON.stringify(snapshot.canvasJson) === JSON.stringify(prev.canvasJson)) {
      console.log('[pushSnapshot] Skipping duplicate snapshot')
      return
    }
    
    // When creating a new snapshot after undo, we need to:
    // 1. Remove future snapshots from in-memory array
    // 2. Delete ALL user history from Firestore and re-save only the kept snapshots
    //    (ID-based deletion is unreliable because IDs are set asynchronously)
    const isBranching = historyIdxRef.current < historyRef.current.length - 1
    
    // Trim in-memory history to current position
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1)
    historyRef.current.push(snapshot)
    historyIdxRef.current = historyRef.current.length - 1
    
    if (isBranching) {
      console.log('[pushSnapshot] Branching history - clearing Firestore and re-saving kept snapshots')
      const boardId = resolveBoardId()
      const sessionId = currentSessionIdRef.current
      if (boardId && sessionId && userEmail) {
        // Get the snapshots to keep (all user snapshots up to and including the new one)
        const snapshotsToKeep = historyRef.current.filter(s => s.userEmail === userEmail)
        
        // Clear all user history from Firestore, then re-save kept snapshots in order
        clearUserHistory(boardId, sessionId, userEmail)
          .then(async () => {
            // Re-save all kept snapshots (excluding the new one which gets saved below)
            for (const s of snapshotsToKeep.slice(0, -1)) {
              try {
                const newId = await saveUserHistorySnapshot(boardId, sessionId, userEmail, s)
                s.id = newId
              } catch (err) {
                console.warn('[pushSnapshot] Failed to re-save kept snapshot:', err)
              }
            }
          })
          .catch(err => console.warn('[pushSnapshot] Failed to clear history for branching:', err))
      }
    }
    console.log('[pushSnapshot] Created snapshot #' + historyIdxRef.current + ' by ' + snapshot.userEmail + ' (total: ' + historyRef.current.length + ')')
    
    // Calculate undo/redo availability for current user only
    const userSnapshots = historyRef.current.filter(s => s.userEmail === user?.email)
    const currentUserSnapshotIndex = userSnapshots.findIndex(s => s === snapshot)
    
    // User can undo if they have at least 1 snapshot (to get back to empty canvas)
    const canUndo = userSnapshots.length > 0
    const canRedo = false // Can't redo after a new change
    
    console.log('[pushSnapshot] Button states - canUndo:', canUndo, 'canRedo:', canRedo, 'userSnapshots:', userSnapshots.length)
    
    onHistoryChange?.({ canUndo, canRedo })
    
    // Save history to Firestore for persistence across refreshes (per-session, per-user)
    const boardId = resolveBoardId()
    const sessionId = currentSessionIdRef.current
    if (boardId && sessionId && userEmail) {
      // Save asynchronously without blocking UI
      saveUserHistorySnapshot(boardId, sessionId, userEmail, snapshot)
        .then(snapshotId => {
          // Store the Firestore document ID in the snapshot for future deletion
          snapshot.id = snapshotId
          console.log('[pushSnapshot] Saved snapshot to Firestore with ID:', snapshotId)
        })
        .catch(err => console.warn('[pushSnapshot] Failed to save history to Firestore:', err))
    }
  }, [onHistoryChange, user])

  const applySnapshot = useCallback((snapshot, userEmail) => {
    const canvas = fabricRef.current
    if (!canvas) return
    
    // Handle both old format (plain JSON) and new format (with metadata)
    const json = snapshot?.canvasJson || snapshot
    const snapshotObjectIds = snapshot?.objectIds || []
    
    if (!json || typeof json !== 'object') {
      console.warn('[Whiteboard] Invalid snapshot data:', snapshot)
      return
    }
    
    // Get current objects on canvas
    const currentObjects = canvas.getObjects()
    const currentObjectMap = {}
    currentObjects.forEach(obj => {
      if (obj.id) {
        currentObjectMap[obj.id] = obj
      }
    })
    
    // Get snapshot objects
    const snapshotObjects = json.objects || []
    const snapshotObjectMap = {}
    snapshotObjects.forEach(obj => {
      if (obj.id) {
        snapshotObjectMap[obj.id] = obj
      }
    })
    
    console.log('[applySnapshot] Current objects:', Object.keys(currentObjectMap).length, 'Snapshot objects:', Object.keys(snapshotObjectMap).length)
    
    // For per-user undo: Only modify objects that belong to this user
    // Keep objects from other users untouched
    isMutingRef.current = true
    
    // Remove objects that are in current canvas but not in snapshot (user's deleted objects)
    const objectsToRemove = []
    currentObjects.forEach(obj => {
      if (obj.id && !snapshotObjectMap[obj.id]) {
        // Check if this object belongs to the user doing the undo
        if (obj.createdBy === userEmail || !obj.createdBy) {
          objectsToRemove.push(obj)
        }
      }
    })
    
    objectsToRemove.forEach(obj => {
      console.log('[applySnapshot] Removing object:', obj.id, 'created by:', obj.createdBy)
      if (obj.stickyText) canvas.remove(obj.stickyText)
      if (obj.stickyRect) canvas.remove(obj.stickyRect)
      canvas.remove(obj)
    })
    
    // Add or update objects from snapshot
    const objectsToAdd = []
    snapshotObjects.forEach(snapshotObj => {
      if (snapshotObj.id) {
        const existingObj = currentObjectMap[snapshotObj.id]
        if (existingObj) {
          // Object exists - update its properties
          existingObj.set({
            left: snapshotObj.left,
            top: snapshotObj.top,
            scaleX: snapshotObj.scaleX,
            scaleY: snapshotObj.scaleY,
            angle: snapshotObj.angle,
            fill: snapshotObj.fill,
            stroke: snapshotObj.stroke,
            strokeWidth: snapshotObj.strokeWidth,
            opacity: snapshotObj.opacity,
          })
          existingObj.setCoords()
        } else {
          // Object doesn't exist - add it (only if it belongs to this user)
          if (snapshotObj.createdBy === userEmail || !snapshotObj.createdBy) {
            objectsToAdd.push(snapshotObj)
          }
        }
      }
    })

    // Restore z-order: move each existing object to match its index in the snapshot
    snapshotObjects.forEach((snapshotObj, targetIndex) => {
      if (!snapshotObj.id) return
      const existingObj = currentObjectMap[snapshotObj.id]
      if (!existingObj) return
      const currentIndex = canvas.getObjects().indexOf(existingObj)
      if (currentIndex !== targetIndex) {
        canvas.moveTo(existingObj, targetIndex)
      }
    })
    
    // Add new objects
    if (objectsToAdd.length > 0) {
      fabric.util.enlivenObjects(objectsToAdd, function(enlivenedObjects) {
        enlivenedObjects.forEach(obj => {
          console.log('[applySnapshot] Adding object:', obj.id, 'created by:', obj.createdBy)
          obj.set({ selectable: true, evented: true })
          if (obj.type === 'line') {
            normalizeLineOrigin(obj)
            obj.set({ perPixelTargetFind: true, hasBorders: false })
            applyLineControls(obj)
          }
          canvas.add(obj)
        })
        canvas.requestRenderAll()
      }, null)
    }
    
    canvas.requestRenderAll()
    isMutingRef.current = false
  }, [])

  const undo = useCallback(() => {
    console.log('[undo] ========== UNDO START ==========')
    
    // Set flag to prevent history reload during undo
    isUndoRedoInProgressRef.current = true
    
    const userEmail = user?.email
    if (!userEmail) {
      console.warn('[undo] No user email - cannot undo')
      isUndoRedoInProgressRef.current = false
      return
    }
    
    console.log('[undo] Current state:')
    console.log('[undo]   - Total snapshots:', historyRef.current.length)
    console.log('[undo]   - Current index:', historyIdxRef.current)
    console.log('[undo]   - User email:', userEmail)
    
    // Current user's snapshots only
    const userSnapshots = historyRef.current.filter(s => s.userEmail === userEmail)
    console.log('[undo]   - User snapshots:', userSnapshots.length)
    
    if (userSnapshots.length === 0) {
      console.log('[undo] No snapshots found for current user')
      isUndoRedoInProgressRef.current = false
      return
    }
    
    // Find current position in user's history
    const currentSnapshot = historyRef.current[historyIdxRef.current]
    const currentUserIdx = userSnapshots.indexOf(currentSnapshot)
    
    console.log('[undo]   - Current snapshot:', currentSnapshot ? 'found' : 'null')
    console.log('[undo]   - Current user index:', currentUserIdx)
    
    if (currentUserIdx < 0) {
      console.log('[undo] Current snapshot not found in user history')
      isUndoRedoInProgressRef.current = false
      return
    }
    
    // If at first snapshot (index 0), undo to empty canvas
    if (currentUserIdx === 0) {
      console.log('[undo] At first snapshot - clearing canvas to empty state')
      
      // Clear canvas to empty state
      const canvas = fabricRef.current
      if (canvas) {
        isMutingRef.current = true
        
        // Remove only objects created by this user
        const objectsToRemove = canvas.getObjects().filter(obj => 
          obj.createdBy === userEmail || !obj.createdBy
        )
        objectsToRemove.forEach(obj => {
          console.log('[undo] Removing object:', obj.id, 'created by:', obj.createdBy)
          if (obj.stickyText) canvas.remove(obj.stickyText)
          if (obj.stickyRect) canvas.remove(obj.stickyRect)
          canvas.remove(obj)
        })
        
        canvas.requestRenderAll()
        isMutingRef.current = false
      }
      
      // Update to "before first snapshot" state
      historyIdxRef.current = -1
      onHistoryChange?.({ canUndo: false, canRedo: true })
      
      // Save updated index to Firestore
      const boardId = resolveBoardId()
      const sessionId = currentSessionIdRef.current
      if (boardId && sessionId && userEmail) {
        updateUserHistoryIndex(boardId, sessionId, userEmail, -1)
          .catch(err => console.warn('[undo] Failed to save history index:', err))
      }
      
      // Broadcast and save empty state
      setTimeout(() => {
        const canvas = fabricRef.current
        if (canvas && canvas.lowerCanvasEl) {
          const canvasJson = getSerializedCanvas(canvas)
          const background = canvas.backgroundColor || '#ffffff'
          
          console.log('[undo] Broadcasting empty canvas state')
          publishFullCanvas({ type: 'canvas:full', canvasJson, background })
          
          if (boardId && sessionId) {
            saveToSessionImmediate(boardId, sessionId, canvasJson, background)
              .then(() => {
                // Clear flags after save completes
                setTimeout(() => {
                  realtimeIgnoreRef.current = false
                  isUndoRedoInProgressRef.current = false
                  console.log('[undo] Cleared realtimeIgnoreRef and isUndoRedoInProgressRef (empty canvas)')
                }, 100)
              })
              .catch(() => {
                // Clear flags even if save fails
                setTimeout(() => {
                  realtimeIgnoreRef.current = false
                  isUndoRedoInProgressRef.current = false
                }, 100)
              })
          } else {
            // Clear flags if no save needed
            setTimeout(() => {
              realtimeIgnoreRef.current = false
              isUndoRedoInProgressRef.current = false
            }, 100)
          }
        } else {
          // Clear flags if canvas not available
          realtimeIgnoreRef.current = false
          isUndoRedoInProgressRef.current = false
        }
      }, 50)
      
      console.log('[undo] ========== UNDO END (empty canvas) ==========')
      return
    }
    
    // Go to previous user snapshot (normal undo)
    const targetSnapshot = userSnapshots[currentUserIdx - 1]
    const targetGlobalIdx = historyRef.current.indexOf(targetSnapshot)
    
    if (targetGlobalIdx === -1) {
      console.warn('[undo] Target snapshot not found in global history')
      return
    }
    
    console.log('[undo] User ' + userEmail + ' going from snapshot #' + historyIdxRef.current + ' to #' + targetGlobalIdx)
    
    // Set flag to ignore realtime updates during undo
    realtimeIgnoreRef.current = true
    
    historyIdxRef.current = targetGlobalIdx
    applySnapshot(targetSnapshot, userEmail)
    
    // Update button states based on NEW position
    const newUserIdx = currentUserIdx - 1
    // Can undo if we're at snapshot 0 or higher (can undo to empty from snapshot 0)
    const canUndoMore = newUserIdx >= 0
    const canRedo = newUserIdx < userSnapshots.length - 1
    console.log('[undo] New button states - canUndo:', canUndoMore, 'canRedo:', canRedo, 'newUserIdx:', newUserIdx)
    onHistoryChange?.({ canUndo: canUndoMore, canRedo })
    
    // Save updated index to Firestore
    const boardId = resolveBoardId()
    const sessionId = currentSessionIdRef.current
    if (boardId && sessionId && userEmail) {
      updateUserHistoryIndex(boardId, sessionId, userEmail, historyIdxRef.current)
        .catch(err => console.warn('[undo] Failed to save history index:', err))
    }
    
    // Save the undone state to database and broadcast immediately
    // This ensures all collaborators see the undo
    setTimeout(() => {
      const canvas = fabricRef.current
      if (canvas && canvas.lowerCanvasEl) {
        // Save to database
        const canvasJson = getSerializedCanvas(canvas)
        const background = canvas.backgroundColor || '#ffffff'
        const sessionId = currentSessionIdRef.current
        
        console.log('[undo] Broadcasting undone state to collaborators')
        
        // Broadcast to collaborators FIRST (before database save)
        const messageSize = JSON.stringify({ canvasJson, background }).length
        if (messageSize < 60000) {
          publishFullCanvas({ type: 'canvas:full', canvasJson, background })
          console.log('[undo] Broadcast successful, size:', messageSize, 'bytes')
        } else {
          console.warn('[undo] Canvas too large to broadcast:', messageSize, 'bytes - using database only')
        }
        
        // Then save to database
        if (boardId && sessionId) {
          saveToSessionImmediate(boardId, sessionId, canvasJson, background)
            .then(() => {
              console.log('[undo] Saved undone state to database')
              // Clear the ignore flag after save completes
              setTimeout(() => {
                realtimeIgnoreRef.current = false
                isUndoRedoInProgressRef.current = false
                console.log('[undo] Cleared realtimeIgnoreRef and isUndoRedoInProgressRef')
              }, 100)
            })
        } else {
          // Clear flag even if save fails
          setTimeout(() => {
            realtimeIgnoreRef.current = false
            isUndoRedoInProgressRef.current = false
          }, 100)
        }
      }
    }, 50)
    console.log('[undo] ========== UNDO END ==========')
  }, [applySnapshot, onHistoryChange, user])

  const redo = useCallback(() => {
    console.log('[redo] ========== REDO START ==========')
    
    // Set flag to prevent history reload during redo
    isUndoRedoInProgressRef.current = true
    
    const userEmail = user?.email
    if (!userEmail) {
      console.warn('[redo] No user email - cannot redo')
      isUndoRedoInProgressRef.current = false
      return
    }
    
    console.log('[redo] Current state:')
    console.log('[redo]   - Total snapshots:', historyRef.current.length)
    console.log('[redo]   - Current index:', historyIdxRef.current)
    
    // Current user's snapshots only
    const userSnapshots = historyRef.current.filter(s => s.userEmail === userEmail)
    console.log('[redo]   - User snapshots:', userSnapshots.length)
    
    if (userSnapshots.length === 0) {
      console.log('[redo] No snapshots found for current user')
      isUndoRedoInProgressRef.current = false
      return
    }
    
    // If at empty canvas state (index -1), redo to first snapshot
    if (historyIdxRef.current === -1) {
      console.log('[redo] At empty canvas - redoing to first snapshot')
      
      const targetSnapshot = userSnapshots[0]
      const targetGlobalIdx = historyRef.current.indexOf(targetSnapshot)
      
      if (targetGlobalIdx === -1) {
        console.warn('[redo] First snapshot not found in global history')
        return
      }
      
      // Set flag to ignore realtime updates during redo
      realtimeIgnoreRef.current = true
      
      historyIdxRef.current = targetGlobalIdx
      applySnapshot(targetSnapshot, userEmail)
      
      // Update button states
      const canUndo = true // Can now undo back to empty
      const canRedo = userSnapshots.length > 1 // Can redo if more snapshots exist
      console.log('[redo] New button states - canUndo:', canUndo, 'canRedo:', canRedo)
      onHistoryChange?.({ canUndo, canRedo })
      
      // Save and broadcast
      const boardId = resolveBoardId()
      const sessionId = currentSessionIdRef.current
      if (boardId && sessionId && userEmail) {
        updateUserHistoryIndex(boardId, sessionId, userEmail, historyIdxRef.current)
          .catch(err => console.warn('[redo] Failed to save history index:', err))
      }
      
      setTimeout(() => {
        const canvas = fabricRef.current
        if (canvas) {
          const canvasJson = getSerializedCanvas(canvas)
          const background = canvas.backgroundColor || '#ffffff'
          
          console.log('[redo] Broadcasting redone state')
          publishFullCanvas({ type: 'canvas:full', canvasJson, background })
          
          if (boardId && sessionId) {
            saveToSessionImmediate(boardId, sessionId, canvasJson, background)
              .then(() => {
                setTimeout(() => {
                  realtimeIgnoreRef.current = false
                  isUndoRedoInProgressRef.current = false
                  console.log('[redo] Cleared realtimeIgnoreRef and isUndoRedoInProgressRef (from empty)')
                }, 100)
              })
              .catch(() => {
                setTimeout(() => {
                  realtimeIgnoreRef.current = false
                  isUndoRedoInProgressRef.current = false
                }, 100)
              })
          } else {
            setTimeout(() => {
              realtimeIgnoreRef.current = false
              isUndoRedoInProgressRef.current = false
            }, 100)
          }
        } else {
          realtimeIgnoreRef.current = false
          isUndoRedoInProgressRef.current = false
        }
      }, 50)
      
      console.log('[redo] ========== REDO END (from empty) ==========')
      return
    }
    
    // Find current position in user's history
    const currentSnapshot = historyRef.current[historyIdxRef.current]
    const currentUserIdx = userSnapshots.indexOf(currentSnapshot)
    
    console.log('[redo]   - Current user index:', currentUserIdx)
    
    if (currentUserIdx >= userSnapshots.length - 1) {
      console.log('[redo] Already at latest snapshot for current user')
      isUndoRedoInProgressRef.current = false
      return
    }
    
    // Go to next user snapshot
    const targetSnapshot = userSnapshots[currentUserIdx + 1]
    const targetGlobalIdx = historyRef.current.indexOf(targetSnapshot)
    
    if (targetGlobalIdx === -1) {
      console.warn('[redo] Target snapshot not found in global history')
      isUndoRedoInProgressRef.current = false
      return
    }
    
    console.log('[redo] User ' + userEmail + ' going from snapshot #' + historyIdxRef.current + ' to #' + targetGlobalIdx)
    
    // Set flag to ignore realtime updates during redo
    realtimeIgnoreRef.current = true
    
    historyIdxRef.current = targetGlobalIdx
    applySnapshot(targetSnapshot, userEmail)
    
    // Update button states based on NEW position
    const newUserIdx = currentUserIdx + 1
    const canUndo = true // Always can undo if we have snapshots
    const canRedoMore = newUserIdx < userSnapshots.length - 1
    console.log('[redo] New button states - canUndo:', canUndo, 'canRedo:', canRedoMore)
    onHistoryChange?.({ canUndo, canRedo: canRedoMore })
    
    // Save updated index to Firestore
    const boardId = resolveBoardId()
    const sessionId = currentSessionIdRef.current
    if (boardId && sessionId && userEmail) {
      updateUserHistoryIndex(boardId, sessionId, userEmail, historyIdxRef.current)
        .catch(err => console.warn('[redo] Failed to save history index:', err))
    }
    
    // Save to database and broadcast after snapshot is applied
    // This ensures all collaborators see the redo
    setTimeout(() => {
      const canvas = fabricRef.current
      if (canvas) {
        const canvasJson = getSerializedCanvas(canvas)
        const background = canvas.backgroundColor || '#ffffff'
        const sessionId = currentSessionIdRef.current
        
        console.log('[redo] Broadcasting redone state to collaborators')
        
        // Broadcast to collaborators FIRST (before database save)
        const messageSize = JSON.stringify({ canvasJson, background }).length
        if (messageSize < 60000) {
          publishFullCanvas({ type: 'canvas:full', canvasJson, background })
          console.log('[redo] Broadcast successful, size:', messageSize, 'bytes')
        } else {
          console.warn('[redo] Canvas too large to broadcast:', messageSize, 'bytes - using database only')
        }
        
        // Then save to database
        if (boardId && sessionId) {
          saveToSessionImmediate(boardId, sessionId, canvasJson, background)
            .then(() => {
              console.log('[redo] Saved redone state to database')
              // Clear the ignore flag after save completes
              setTimeout(() => {
                realtimeIgnoreRef.current = false
                isUndoRedoInProgressRef.current = false
                console.log('[redo] Cleared realtimeIgnoreRef and isUndoRedoInProgressRef')
              }, 100)
            })
            .catch(() => {
              // Clear flags even if save fails
              setTimeout(() => {
                realtimeIgnoreRef.current = false
                isUndoRedoInProgressRef.current = false
              }, 100)
            })
        } else {
          // Clear flags if no save needed
          setTimeout(() => {
            realtimeIgnoreRef.current = false
            isUndoRedoInProgressRef.current = false
          }, 100)
        }
      }
    }, 50)
    console.log('[redo] ========== REDO END ==========')
  }, [applySnapshot, onHistoryChange, user])

  const clearCanvas = useCallback(async () => {
    const canvas = fabricRef.current
    if (!canvas) return
    
    console.log('[clearCanvas] Clearing canvas and resetting history')
    
    isMutingRef.current = true
    canvas.getObjects().slice().forEach(obj => {
      if (obj.stickyText) canvas.remove(obj.stickyText)
      if (obj.stickyRect) canvas.remove(obj.stickyRect)
      canvas.remove(obj)
    })
    isMutingRef.current = false
    canvas.discardActiveObject()
    canvas.renderAll()
    
    // Mark that canvas was intentionally cleared (permanent marker)
    lastLocalChangeRef.current = Date.now()
    
    // Broadcast clear to all collaborators FIRST
    const boardId = resolveBoardId()
    if (boardId) {
      publishClear({ type: 'canvas:clear', background: canvas.backgroundColor || '#ffffff' })
    }
    
    // Save the cleared state to DB IMMEDIATELY (no debounce)
    const json = getSerializedCanvas(canvas)
    const sessionId = currentSessionIdRef.current
    if (boardId && sessionId) {
      await saveToSessionImmediate(boardId, sessionId, json, canvas.backgroundColor || '#ffffff')
      console.log('[clearCanvas] Empty canvas saved to database')
    }
    
    // Reset history AFTER saving to DB
    historyRef.current = []
    historyIdxRef.current = -1
    
    // Clear ALL users' history from Firestore (not just current user)
    if (boardId && sessionId) {
      clearAllSessionHistory(boardId, sessionId)
        .catch(err => console.warn('[clearCanvas] Failed to clear all Firestore history:', err))
    }
    
    // Create initial empty snapshot after a short delay
    setTimeout(() => {
      if (!canvas || !canvas.lowerCanvasEl) return
      const emptySnapshot = {
        canvasJson: getSerializedCanvas(canvas),
        userEmail: user?.email || 'anonymous',
        timestamp: Date.now()
      }
      historyRef.current = [emptySnapshot]
      historyIdxRef.current = 0
      onHistoryChange?.({ canUndo: false, canRedo: false })
      console.log('[clearCanvas] Created empty snapshot')
      
      // Save initial empty snapshot to Firestore
      if (boardId && sessionId && userEmail) {
        saveUserHistorySnapshot(boardId, sessionId, userEmail, emptySnapshot)
          .catch(err => console.warn('[clearCanvas] Failed to save empty snapshot:', err))
      }
    }, 150)
  }, [onHistoryChange, user])

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
      // Use viewport-aware sizing: compute visible canvas area in canvas coords
      const vpt = canvas.viewportTransform
      const zoom = vpt ? vpt[0] : 1
      const visW = canvas.getWidth() / zoom
      const visH = canvas.getHeight() / zoom
      // Cap to 40% of visible area, max 500px in canvas coords
      const maxW = Math.min(visW * 0.4, 500)
      const maxH = Math.min(visH * 0.4, 500)
      const scale = Math.min(maxW / img.width, maxH / img.height, 1)
      // Center in visible viewport (account for pan offset)
      const vpOffX = vpt ? vpt[4] : 0
      const vpOffY = vpt ? vpt[5] : 0
      const centerX = (canvas.getWidth() / 2 - vpOffX) / zoom
      const centerY = (canvas.getHeight() / 2 - vpOffY) / zoom
      img.set({
        left: centerX - (img.width * scale) / 2,
        top: centerY - (img.height * scale) / 2,
        scaleX: scale, scaleY: scale,
        selectable: true, evented: true,
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,.12)', blur: 12, offsetX: 0, offsetY: 3 }),
      })
      canvas.add(img)
      canvas.setActiveObject(img)
      canvas.renderAll()
      setTool('select')
      
      // Trigger synchronization after image is loaded and added
      setTimeout(() => {
        onMutation()
        publishFullCanvas()
      }, 100)
    })
  }, [setTool])

  // Function to reload canvas when session changes
  const reloadSession = useCallback((sessionId) => {
    const canvas = fabricRef.current
    if (!canvas || !canvas.lowerCanvasEl) return
    
    // Use provided sessionId or fall back to current
    const targetSessionId = sessionId || currentSessionIdRef.current
    if (!targetSessionId) {
      console.warn('[Whiteboard] No session ID provided for reload')
      return
    }
    
    console.log('[Whiteboard] Reloading session:', targetSessionId)
    
    // Clear current canvas
    isMutingRef.current = true
    canvas.getObjects().slice().forEach(obj => {
      if (obj.stickyText) canvas.remove(obj.stickyText)
      if (obj.stickyRect) canvas.remove(obj.stickyRect)
      canvas.remove(obj)
    })
    canvas.discardActiveObject()
    isMutingRef.current = false
    
    // Reset history
    historyRef.current = []
    historyIdxRef.current = -1
    onHistoryChange?.({ canUndo: false, canRedo: false })
    
    // Reload canvas data from database
    deserializeCanvas(canvas, isMutingRef, targetSessionId, (result) => {
      console.log('[Whiteboard] Session reloaded successfully')
      canvas.renderAll()
      
      // Create initial snapshot with user metadata
      const snapshot = {
        canvasJson: getSerializedCanvas(canvas),
        userEmail: user?.email || 'anonymous',
        timestamp: Date.now()
      }
      historyRef.current = [snapshot]
      historyIdxRef.current = 0
      onHistoryChange?.({ canUndo: false, canRedo: false })
    })
  }, [onHistoryChange, user])

  useEffect(() => {
    window.__wbUndo = undo
    window.__wbRedo = redo
    window.__wbClear = clearCanvas
    window.__wbAddImage = addImage
    window.__wbDelete = deleteSelected
    window.__wbLoadSession = reloadSession
    return () => {
      delete window.__wbUndo; delete window.__wbRedo
      delete window.__wbClear; delete window.__wbAddImage; delete window.__wbDelete
      delete window.__wbLoadSession
    }
  }, [undo, redo, clearCanvas, addImage, deleteSelected, reloadSession])

  // Auto-load session when currentSessionId becomes available after initial mount
  // This handles the case where the canvas initializes before the session ID is resolved
  useEffect(() => {
    if (!currentSessionId) return
    const canvas = fabricRef.current
    if (!canvas || !canvas.lowerCanvasEl) return
    // If canvas was loaded without a session (isLoadedRef is true but the initial
    // deserializeCanvas was called with null sessionId), reload now that we have a session ID
    if (isLoadedRef.current && !isLoadedRef.sessionId) {
      console.log('[Whiteboard] Session became available after mount, loading canvas:', currentSessionId)
      reloadSession(currentSessionId)
    }
  }, [currentSessionId, reloadSession])

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
    // Initial load uses currentSessionId - if null, the session useEffect below will trigger a reload
    deserializeCanvas(canvas, isMutingRef, currentSessionId, (result) => {
      isLoadedRef.current = true
      // Track which sessionId was used for the initial load.
      // Use URL as fallback (same logic as deserializeCanvas).
      isLoadedRef.sessionId = currentSessionId || resolveSessionId()
      
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
      const canvasJson = getSerializedCanvas(canvas)
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
    }, 300) // Reduced to 300ms for faster real-time updates

    // Expose broadcastCanvas via ref so ctxItems (outside this effect) can call it directly
    broadcastCanvasRef.current = broadcastCanvas
    const broadcastViewport = throttle(() => {
      if (!boardId || !canvas || !canvas.viewportTransform) return
      const vpt = canvas.viewportTransform
      const viewport = {
        zoom: vpt[0], // scale x (assuming uniform scaling)
        panX: vpt[4], // translate x
        panY: vpt[5]  // translate y
      }
      console.log('[Whiteboard] Broadcasting viewport sync:', viewport)
      publishViewportSync(viewport)
    }, 150) // Reduced to 150ms for smoother viewport sync

    // Note: Realtime initialization moved to separate useEffect (runs when sessionId/user changes)

    // ── Canvas mutation handler: save + broadcast ─────────────────────────
    const onMutation = () => {
      // Don't create history entries until initial load is complete
      if (!isLoadedRef.current) return
      if (isMutingRef.current || isDrawingRef.current || realtimeIgnoreRef.current) return
      
      // Track that we made a local change
      lastLocalChangeRef.current = Date.now()
      
      // Update presence to show user is editing
      if (user) {
        updatePresence({
          name: user.name,
          email: user.email,
          isEditing: true
        })
        
        // Clear any existing timeout
        if (editingTimeoutRef.current) {
          clearTimeout(editingTimeoutRef.current)
        }
        
        // Set isEditing to false after 2 seconds of inactivity
        editingTimeoutRef.current = setTimeout(() => {
          if (user) {
            updatePresence({
              name: user.name,
              email: user.email,
              isEditing: false
            })
          }
        }, 2000)
      }
      
      serializeCanvas(canvas, currentSessionIdRef)
      pushSnapshot()
      // Broadcast full canvas to collaborators
      broadcastCanvas()
    }
    onMutationRef.current = onMutation
    
    // Assign unique IDs to new objects for merge conflict resolution
    canvas.on('object:added', (e) => {
      const obj = e.target
      if (obj && !obj.id) {
        // Generate unique ID: timestamp + random string
        obj.id = `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
      // Tag object with creator's email for per-user undo/redo
      if (obj && !obj.createdBy && user?.email) {
        obj.createdBy = user.email
        console.log('[Whiteboard] Tagged object', obj.id, 'as created by', user.email)
      }
      onMutation()
    })
    canvas.on('object:modified', (e) => {
      // Update text bar position after modification completes
      const obj = e.target
      if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
        updateTextBarPos(obj)
      }
      onMutation()
    })
    canvas.on('object:removed', onMutation)
    canvas.on('path:created', (opt) => {
      if (toolRef.current === 'eraser')
        opt.path.set({ isEraserStroke: true, selectable: false, evented: false })
      onMutation()
    })
    
    // Turn off editing indicator when selection is cleared (with delay)
    canvas.on('selection:cleared', () => {
      if (user && !isEditingTextRef.current && !isDrawingRef.current) {
        console.log('[Whiteboard] selection:cleared - Will clear isEditing after timeout')
        
        // Clear any existing timeout
        if (editingTimeoutRef.current) {
          clearTimeout(editingTimeoutRef.current)
        }
        
        // Set isEditing to false after 2 seconds of inactivity
        editingTimeoutRef.current = setTimeout(() => {
          if (user) {
            console.log('[Whiteboard] Timeout expired - Setting isEditing to FALSE')
            updatePresence({
              name: user.name,
              email: user.email,
              isEditing: false
            })
          }
        }, 2000)
      }
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
      // Restore all previously highlighted lines
      canvas.getObjects().forEach(obj => {
        if (obj.type === 'line' && obj.__origStroke !== undefined) {
          obj.set('stroke', obj.__origStroke)
          delete obj.__origStroke
        }
      })
      // Do NOT change the stroke color for selection highlight.
      // Instead, rely on the endpoint handles (applyLineControls) to show selection.
      // This prevents the blue stroke from being saved on refresh.
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
      // Publish all selected IDs to other users
      if (user) {
        const ids = (e.selected || []).map(obj => obj.id).filter(Boolean)
        publishSelection(ids.length === 1 ? ids[0] : ids.length > 1 ? ids : null)
      }
    })
    canvas.on('selection:updated', (e) => {
      const o = e.selected?.[0]
      setSelectedObject(o && SHAPE_TYPES.includes(o.type) ? o : null)
      syncTextBar(o)
      updateTextBarPos(o)
      highlightLines(e.selected || [])
      // Publish all selected IDs to other users
      if (user) {
        const allSelected = canvas.getActiveObject()?.type === 'activeSelection'
          ? canvas.getActiveObject().getObjects()
          : (e.selected || [])
        const ids = allSelected.map(obj => obj.id).filter(Boolean)
        publishSelection(ids.length === 1 ? ids[0] : ids.length > 1 ? ids : null)
      }
    })
    canvas.on('selection:cleared', () => {
      setSelectedObject(null)
      setShowTextBar(false)
      setTextBarPosition(null)
      highlightLines([])
      // Clear selection for other users
      if (user) publishSelection(null)
    })

    // Track when user is editing text to prevent database polling from interrupting
    canvas.on('text:editing:entered', () => {
      console.log('[Whiteboard] Text editing started - pausing database sync')
      isEditingTextRef.current = true
      lastLocalChangeRef.current = Date.now()
      
      // Update presence to show user is editing
      if (user) {
        updatePresence({
          name: user.name,
          email: user.email,
          isEditing: true
        })
      }
    })
    canvas.on('text:editing:exited', () => {
      console.log('[Whiteboard] Text editing finished - resuming database sync')
      isEditingTextRef.current = false
      lastLocalChangeRef.current = Date.now()
      
      // Update presence to show user stopped editing (with delay)
      if (user) {
        // Clear any existing timeout
        if (editingTimeoutRef.current) {
          clearTimeout(editingTimeoutRef.current)
        }
        
        // Set isEditing to false after 1 second (shorter for text since it's explicit)
        editingTimeoutRef.current = setTimeout(() => {
          if (user) {
            console.log('[Whiteboard] Text editing timeout - Setting isEditing to FALSE')
            updatePresence({
              name: user.name,
              email: user.email,
              isEditing: false
            })
          }
        }, 1000)
      }
    })

    canvas.on('object:moving', (e) => {
      // Track movement to prevent database polling during drag
      lastLocalChangeRef.current = Date.now()
      
      // Update presence to show user is editing
      if (user && !isEditingTextRef.current) {
        console.log('[Whiteboard] object:moving - Setting isEditing to TRUE')
        updatePresence({
          name: user.name,
          email: user.email,
          isEditing: true
        })
        
        // Clear any existing timeout
        if (editingTimeoutRef.current) {
          clearTimeout(editingTimeoutRef.current)
        }
        
        // Set isEditing to false after 2 seconds of inactivity
        editingTimeoutRef.current = setTimeout(() => {
          if (user) {
            updatePresence({
              name: user.name,
              email: user.email,
              isEditing: false
            })
          }
        }, 2000)
      }
      
      const obj = e.target
      if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
        // Use requestAnimationFrame for smooth position updates during drag
        requestAnimationFrame(() => {
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
        })
      }
      if (obj && obj.stickyText && typeof obj.stickyText.getBoundingRect === 'function') {
        requestAnimationFrame(() => {
          const canvasEl = canvas.upperCanvasEl || canvas.lowerCanvasEl
          const canvasRect = canvasEl
            ? canvasEl.getBoundingClientRect()
            : container.getBoundingClientRect()
          const br = obj.stickyText.getBoundingRect(true, true)
          setTextBarPosition({
            left: canvasRect.left + br.left,
            top: canvasRect.top + br.top,
            width: br.width,
            height: br.height,
          })
        })
      }
    })
    canvas.on('object:scaling', (e) => {
      // Track scaling to prevent database polling during scale
      lastLocalChangeRef.current = Date.now()
      
      // Update presence to show user is editing
      if (user && !isEditingTextRef.current) {
        console.log('[Whiteboard] object:scaling - Setting isEditing to TRUE')
        updatePresence({
          name: user.name,
          email: user.email,
          isEditing: true
        })
        
        // Clear any existing timeout
        if (editingTimeoutRef.current) {
          clearTimeout(editingTimeoutRef.current)
        }
        
        // Set isEditing to false after 2 seconds of inactivity
        editingTimeoutRef.current = setTimeout(() => {
          if (user) {
            updatePresence({
              name: user.name,
              email: user.email,
              isEditing: false
            })
          }
        }, 2000)
      }
      
      const obj = e.target
      if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
        updateTextBarPos(obj)
      }
    })
    canvas.on('object:rotating', (e) => {
      // Track rotation
      lastLocalChangeRef.current = Date.now()
      
      // Update presence to show user is editing
      if (user && !isEditingTextRef.current) {
        console.log('[Whiteboard] object:rotating - Setting isEditing to TRUE')
        updatePresence({
          name: user.name,
          email: user.email,
          isEditing: true
        })
        
        // Clear any existing timeout
        if (editingTimeoutRef.current) {
          clearTimeout(editingTimeoutRef.current)
        }
        
        // Set isEditing to false after 2 seconds of inactivity
        editingTimeoutRef.current = setTimeout(() => {
          if (user) {
            updatePresence({
              name: user.name,
              email: user.email,
              isEditing: false
            })
          }
        }, 2000)
      }
      
      const obj = e.target
      if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
        updateTextBarPos(obj)
      }
    })
    
    // Ensure snapshots are created after object transformations complete
    // This handles cases where object:modified might not fire automatically
    let transformCompleteTimer = null
    canvas.on('mouse:up', () => {
      clearTimeout(transformCompleteTimer)
      transformCompleteTimer = setTimeout(() => {
        const activeObject = canvas.getActiveObject()
        if (activeObject && !isMutingRef.current && !isDrawingRef.current) {
          // Manually trigger object:modified to ensure snapshot is created
          canvas.fire('object:modified', { target: activeObject })
        }
      }, 100)
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
      broadcastViewport() // Sync viewport with collaborators
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
      // Sync viewport with collaborators
      broadcastViewport()
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
        const json = getSerializedCanvas(canvas)
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
      // Don't disconnect realtime here - the realtime useEffect handles it properly
      // Calling disconnect here causes issues with React StrictMode double-mount
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
      // Clear editing timeout on cleanup
      if (editingTimeoutRef.current) {
        clearTimeout(editingTimeoutRef.current)
      }
      canvas.dispose()
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Context menu items ────────────────────────────────────────────────────
  const ctxItems = useCallback((target, selectedObjects) => {
    const c = fabricRef.current
    if (!c || !target) return []
    const snap = () => { serializeCanvas(c, currentSessionIdRef); pushSnapshot() }

    const reorderAndSnap = (moveFn) => {
      moveFn()
      c.discardActiveObject()
      c.renderAll()
      requestAnimationFrame(() => {
        c.setActiveObject(target)
        target.setCoords()
        c.renderAll()
        // Save + push snapshot for undo
        serializeCanvas(c, currentSessionIdRef)
        pushSnapshot()
        // Broadcast directly (unthrottled) so z-order change reaches collaborators immediately
        const canvasJson = getSerializedCanvas(c)
        const background = c.backgroundColor || '#ffffff'
        publishFullCanvas({ type: 'canvas:full', canvasJson, background })
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
      { label: 'Bring to Front', icon: 'front',    action: () => reorderAndSnap(() => c.bringToFront(target)) },
      { label: 'Bring Forward',  icon: 'forward',  action: () => reorderAndSnap(() => c.bringForward(target)) },
      { label: 'Send Backward',  icon: 'backward', action: () => reorderAndSnap(() => c.sendBackwards(target)) },
      { label: 'Send to Back',   icon: 'back',     action: () => reorderAndSnap(() => c.sendToBack(target)) },
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
      if (isLoadedRef.current) serializeCanvas(canvas, currentSessionIdRef)
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
      
      // Update presence to show user is editing
      if (user && currentTool !== 'select') {
        console.log('[Whiteboard] onMouseDown - Setting isEditing to TRUE for tool:', currentTool)
        updatePresence({
          name: user.name,
          email: user.email,
          isEditing: true
        })
        
        // Clear any existing timeout
        if (editingTimeoutRef.current) {
          clearTimeout(editingTimeoutRef.current)
        }
        
        // Set isEditing to false after 2 seconds of inactivity
        editingTimeoutRef.current = setTimeout(() => {
          if (user) {
            updatePresence({
              name: user.name,
              email: user.email,
              isEditing: false
            })
          }
        }, 2000)
      }

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
            originX: 'center', originY: 'center',
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
          t.on('changed', function () { 
            this.isPlaceholder = (this.text.trim() === '')
            canvas.renderAll()
            // Update text bar position as text grows
            const textObj = this
            requestAnimationFrame(() => {
              const canvasEl = canvas.upperCanvasEl || canvas.lowerCanvasEl
              if (canvasEl) {
                const canvasRect = canvasEl.getBoundingClientRect()
                const br = textObj.getBoundingRect(true, true)
                setTextBarPosition({
                  left: canvasRect.left + br.left,
                  top: canvasRect.top + br.top,
                  width: br.width,
                  height: br.height,
                })
              }
            })
            // Broadcast text changes in real-time (throttled)
            if (!realtimeIgnoreRef.current) {
              broadcastCanvas()
            }
          })
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
          txt.on('changed', function () { 
            this.isPlaceholder = (this.text.trim() === '')
            canvas.renderAll()
            // Update text bar position as text grows (for sticky notes)
            const textObj = this
            requestAnimationFrame(() => {
              const canvasEl = canvas.upperCanvasEl || canvas.lowerCanvasEl
              if (canvasEl) {
                const canvasRect = canvasEl.getBoundingClientRect()
                const br = textObj.getBoundingRect(true, true)
                setTextBarPosition({
                  left: canvasRect.left + br.left,
                  top: canvasRect.top + br.top,
                  width: br.width,
                  height: br.height,
                })
              }
            })
            // Broadcast text changes in real-time (throttled)
            if (!realtimeIgnoreRef.current) {
              broadcastCanvas()
            }
          })
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
      
      // Don't immediately set isEditing to false - let the timeout handle it
      // This allows the "editing" indicator to persist for a moment after each action
      // The timeout in onMouseDown/onMutation will clear it after 2 seconds of inactivity

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
            publishFullCanvas({ type: 'canvas:full', canvasJson: getSerializedCanvas(canvas), background: canvas.backgroundColor || '#ffffff' })
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
    serializeCanvas(canvas, currentSessionIdRef)
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
      <PresenceIndicators containerRef={containerRef} fabricRef={fabricRef} />
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