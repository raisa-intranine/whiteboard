// src/services/realtime.js — Ably realtime client wrapper
// Handles connecting, publishing drawing events, and subscribing to remote events.

import * as AblyLib from 'ably'
import { getRealtimeToken } from './api'

let realtimeClient = null
let boardChannel = null
let myClientId = null

/**
 * Check if realtime connection is ready
 */
export const isRealtimeReady = () => {
    return realtimeClient && 
           realtimeClient.connection && 
           realtimeClient.connection.state === 'connected' &&
           boardChannel &&
           myClientId !== null
}

/**
 * Initialize the Ably client and subscribe to a board channel.
 * @param {string} boardId
 * @param {string|null} sessionId
 * @param {(msg: any) => void} onMessage
 */
export const initRealtime = async (boardId, sessionId, onMessage) => {
    // If already connected to this board + session, skip
    const channelName = sessionId ? `board:${boardId}:session:${sessionId}` : `board:${boardId}`
    if (boardChannel && boardChannel.name === channelName && realtimeClient && realtimeClient.connection.state === 'connected') {
        console.log('[Realtime] Already connected to channel:', channelName)
        return
    }

    // Only disconnect if we're switching to a different channel
    if (boardChannel && boardChannel.name !== channelName) {
        console.log('[Realtime] Switching from', boardChannel.name, 'to', channelName)
        await disconnectRealtime()
    }

    realtimeClient = new AblyLib.Realtime({
        authCallback: async (_tokenParams, callback) => {
            try {
                const { tokenRequest } = await getRealtimeToken(boardId, sessionId)
                callback(null, tokenRequest)
            } catch (err) {
                callback(err, null)
            }
        },
        echoMessages: false, // don't receive our own messages
    })

    boardChannel = realtimeClient.channels.get(channelName)
    
    // Log channel state changes
    boardChannel.on('attached', () => {
        console.log('[Realtime] Channel attached:', boardChannel.name)
    })
    boardChannel.on('failed', (err) => {
        console.error('[Realtime] Channel failed:', err)
    })

    // Track our own clientId
    realtimeClient.connection.on('connected', () => {
        myClientId = realtimeClient.auth.clientId
        console.log('[Realtime] Connected with clientId:', myClientId, 'to board:', boardId, 'session:', sessionId || '(none)')
        console.log('[Realtime] Channel name:', channelName)
        console.log('[Realtime] Connection state:', realtimeClient.connection.state)
        console.log('[Realtime] Auth clientId:', realtimeClient.auth.clientId)
    })
    
    realtimeClient.connection.on('disconnected', () => {
        console.log('[Realtime] Disconnected - clientId was:', myClientId)
    })
    
    realtimeClient.connection.on('failed', (err) => {
        console.error('[Realtime] Connection failed:', err)
    })
    
    realtimeClient.connection.on('suspended', () => {
        console.warn('[Realtime] Connection suspended')
    })

    // Subscribe to all canvas events
    boardChannel.subscribe((msg) => {
        console.log('[Realtime] Received message:', msg.data?.type, 'from clientId:', msg.clientId)
        if (typeof onMessage === 'function') onMessage(msg.data)
    })
}

/**
 * Publish full canvas state to all collaborators.
 * @param {{ type: 'canvas:full', canvasJson: object, background: string }} data
 */
export const publishFullCanvas = (data) => {
    if (!boardChannel) {
        console.warn('[Realtime] Cannot publish - no active channel')
        return
    }
    console.log('[Realtime] Publishing full canvas to channel:', boardChannel.name)
    
    // Ably will throw an error if message is too large, catch it gracefully
    boardChannel.publish('canvas:sync', data).catch(err => {
        console.error('[Realtime] Failed to publish canvas:', err.message)
        console.log('[Realtime] Canvas data too large - collaborators will sync from database instead')
    })
}

/**
 * Request a canvas sync from other collaborators (useful when database load fails)
 */
export const requestSync = () => {
    if (!boardChannel) {
        console.warn('[Realtime] Cannot request sync - no active channel')
        return
    }
    console.log('[Realtime] Requesting canvas sync from collaborators')
    boardChannel.publish('canvas:sync', { type: 'sync:request' })
}

/**
 * Publish a canvas:clear event to all collaborators.
 * @param {{ type: 'canvas:clear', background: string }} data
 */
export const publishClear = (data) => {
    if (!boardChannel) {
        console.warn('[Realtime] Cannot publish clear - no active channel')
        return
    }
    console.log('[Realtime] Publishing clear canvas to channel:', boardChannel.name)
    boardChannel.publish('canvas:sync', data)
}

/**
 * Get the current client ID
 */
export const getClientId = () => {
    // Try to get it from the realtimeClient first (most reliable)
    if (realtimeClient && realtimeClient.auth && realtimeClient.auth.clientId) {
        myClientId = realtimeClient.auth.clientId
        return myClientId
    }
    
    // Return cached clientId if available
    if (myClientId) {
        return myClientId
    }
    
    // Try connection.id as fallback
    if (realtimeClient && realtimeClient.connection && realtimeClient.connection.id) {
        return realtimeClient.connection.id
    }
    
    console.warn('[Realtime] getClientId() returning null - connection may not be established yet')
    return null
}

/**
 * Enter presence with user info (name, email)
 * @param {{ name: string, email: string, isEditing?: boolean }} userData
 */
export const enterPresence = async (userData) => {
    if (!boardChannel) {
        console.warn('[Realtime] Cannot enter presence - no active channel')
        return
    }
    if (!realtimeClient) {
        console.warn('[Realtime] Cannot enter presence - client not initialized')
        return
    }
    
    // Wait for connection to be established before entering presence
    return new Promise((resolve) => {
        const attemptEnter = async () => {
            try {
                // Ensure myClientId is set by giving a moment for connection handler to run
                await new Promise(resolve => setTimeout(resolve, 100))
                await boardChannel.presence.enter(userData)
                console.log('[Realtime] Entered presence:', userData.name, 'clientId:', myClientId || realtimeClient?.auth?.clientId)
                resolve()
            } catch (err) {
                console.error('[Realtime] Failed to enter presence:', err)
                resolve() // Don't block even if presence fails
            }
        }
        
        if (realtimeClient.connection.state === 'connected') {
            attemptEnter()
        } else {
            realtimeClient.connection.once('connected', attemptEnter)
        }
    })
}

/**
 * Update presence state (e.g., isEditing flag)
 * @param {{ name: string, email: string, isEditing?: boolean }} userData
 */
export const updatePresence = async (userData) => {
    if (!boardChannel) {
        console.warn('[Realtime] Cannot update presence - no active channel')
        return
    }
    console.log('[Realtime] Updating presence:', userData.name, 'isEditing:', userData.isEditing)
    try {
        await boardChannel.presence.update(userData)
        console.log('[Realtime] Presence updated successfully')
    } catch (err) {
        console.error('[Realtime] Failed to update presence:', err)
    }
}

/**
 * Subscribe to presence changes (enter, update, leave)
 * @param {(event: string, member: object) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export const onPresenceChange = (callback) => {
    if (!boardChannel) {
        console.warn('[Realtime] Cannot subscribe to presence - no active channel')
        return () => {}
    }
    
    const handler = (member) => {
        callback('enter', member)
    }
    const updateHandler = (member) => {
        callback('update', member)
    }
    const leaveHandler = (member) => {
        callback('leave', member)
    }
    
    boardChannel.presence.subscribe('enter', handler)
    boardChannel.presence.subscribe('update', updateHandler)
    boardChannel.presence.subscribe('leave', leaveHandler)
    
    return () => {
        boardChannel.presence.unsubscribe('enter', handler)
        boardChannel.presence.unsubscribe('update', updateHandler)
        boardChannel.presence.unsubscribe('leave', leaveHandler)
    }
}

/**
 * Check if realtime is connected
 * @returns {boolean}
 */
export const isRealtimeConnected = () => {
    return !!(boardChannel && realtimeClient && realtimeClient.connection.state === 'connected')
}

/**
 * Get all current presence members
 * @returns {Promise<Array>}
 */
export const getPresenceMembers = async () => {
    if (!boardChannel) {
        // Silently return empty array if no channel yet (during initialization)
        return []
    }
    try {
        const members = await boardChannel.presence.get()
        console.log('[Realtime] getPresenceMembers() returned', members.length, 'members')
        members.forEach(m => {
            console.log('[Realtime]   - Member:', m.clientId, 'data:', m.data)
        })
        return members
    } catch (err) {
        console.error('[Realtime] Failed to get presence members:', err)
        return []
    }
}

/**
 * Subscribe to cursor movement events
 * @param {(clientId: string, data: {x: number, y: number}) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export const onCursorMove = (callback) => {
    if (!boardChannel) {
        console.warn('[Realtime] Cannot subscribe to cursor - no active channel')
        return () => {}
    }
    
    const handler = (msg) => {
        if (msg.data?.type === 'cursor:move') {
            callback(msg.clientId, { x: msg.data.x, y: msg.data.y })
        }
    }
    
    boardChannel.subscribe('cursor:move', handler)
    
    return () => {
        boardChannel.unsubscribe('cursor:move', handler)
    }
}

/**
 * Publish cursor position
 * @param {{ x: number, y: number }} position
 */
export const publishCursorMove = (position) => {
    if (!boardChannel) return
    boardChannel.publish('cursor:move', { type: 'cursor:move', ...position })
}

/**
 * Subscribe to viewport sync events
 * @param {(viewport: { zoom: number, panX: number, panY: number }) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export const onViewportSync = (callback) => {
    if (!boardChannel) {
        console.warn('[Realtime] Cannot subscribe to viewport - no active channel')
        return () => {}
    }
    
    const handler = (msg) => {
        if (msg.data?.type === 'viewport:sync') {
            callback(msg.data)
        }
    }
    
    boardChannel.subscribe('viewport:sync', handler)
    
    return () => {
        boardChannel.unsubscribe('viewport:sync', handler)
    }
}

/**
 * Publish viewport position (zoom + pan) to sync with collaborators
 * @param {{ zoom: number, panX: number, panY: number }} viewport
 */
export const publishViewportSync = (viewport) => {
    if (!boardChannel) {
        console.warn('[Realtime] Cannot publish viewport - no active channel')
        return
    }
    console.log('[Realtime] Publishing viewport sync:', viewport)
    boardChannel.publish('viewport:sync', { type: 'viewport:sync', ...viewport })
}

/**
 * Disconnect and clean up the Ably client.
 */
export const disconnectRealtime = async () => {
    console.log('[Realtime] disconnectRealtime() called, boardChannel:', !!boardChannel, 'realtimeClient:', !!realtimeClient)
    
    if (boardChannel) {
        // Leave presence before disconnecting
        try {
            await boardChannel.presence.leave()
            console.log('[Realtime] Left presence successfully')
        } catch (err) {
            console.warn('[Realtime] Failed to leave presence:', err)
        }
        
        try {
            boardChannel.unsubscribe()
            console.log('[Realtime] Unsubscribed from channel')
        } catch (err) {
            console.warn('[Realtime] Failed to unsubscribe:', err)
        }
        
        boardChannel = null
    }
    
    if (realtimeClient) {
        try {
            realtimeClient.close()
            console.log('[Realtime] Closed realtime client')
        } catch (err) {
            console.warn('[Realtime] Failed to close client:', err)
        }
        realtimeClient = null
    }
    
    myClientId = null
    console.log('[Realtime] Disconnect complete')
}
