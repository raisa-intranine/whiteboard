// src/services/realtime.js — Ably realtime client wrapper
// Handles connecting, publishing drawing events, and subscribing to remote events.

import * as AblyLib from 'ably'
import { getRealtimeToken } from './api'

let realtimeClient = null
let boardChannel = null
let myClientId = null

/**
 * Initialize the Ably client and subscribe to a board channel.
 * @param {string} boardId
 * @param {(msg: any) => void} onMessage
 */
export const initRealtime = async (boardId, onMessage) => {
    // If already connected to this board, skip
    if (boardChannel && boardChannel.name === `board:${boardId}`) return

    await disconnectRealtime()

    realtimeClient = new AblyLib.Realtime({
        authCallback: async (_tokenParams, callback) => {
            try {
                const { tokenRequest } = await getRealtimeToken(boardId)
                callback(null, tokenRequest)
            } catch (err) {
                callback(err, null)
            }
        },
        echoMessages: false, // don't receive our own messages
    })

    boardChannel = realtimeClient.channels.get(`board:${boardId}`)
    
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
        console.log('[Realtime] Connected with clientId:', myClientId, 'to board:', boardId)
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
export const getClientId = () => myClientId

/**
 * Disconnect and clean up the Ably client.
 */
export const disconnectRealtime = async () => {
    if (boardChannel) {
        boardChannel.unsubscribe()
        boardChannel = null
    }
    if (realtimeClient) {
        realtimeClient.close()
        realtimeClient = null
    }
    myClientId = null
}
