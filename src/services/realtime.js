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
 * @param {(msg: { type: string, payload: object, userId: string }) => void} onMessage
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
        echoMessages: false, // don't receive our own published messages
    })

    boardChannel = realtimeClient.channels.get(`board:${boardId}`)

    // Track our own clientId so we can optionally filter self-messages
    realtimeClient.connection.on('connected', () => {
        myClientId = realtimeClient.auth.clientId
    })

    boardChannel.subscribe('canvas:delta', (msg) => {
        if (typeof onMessage === 'function') onMessage(msg.data)
    })
}

/**
 * Publish a canvas delta (a single modified fabric.js object) to all collaborators.
 * @param {{ type: string, payload: object, userId: string }} data
 */
export const publishDelta = (data) => {
    if (!boardChannel) return
    boardChannel.publish('canvas:delta', data)
}

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
}
