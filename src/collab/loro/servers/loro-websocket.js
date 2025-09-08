import { LoroDoc } from 'loro-crdt'

// Message types for Loro WebSocket protocol
const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

const reconnectTimeoutBase = 1200
const maxReconnectTimeout = 2500
const messageReconnectTimeout = 30000

/**
 * Simple EventEmitter implementation
 */
class EventEmitter {
  constructor() {
    this.listeners = new Map()
  }

  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(listener)
  }

  off(event, listener) {
    const listeners = this.listeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  emit(event, ...args) {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.forEach(listener => listener(...args))
    }
  }

  destroy() {
    this.listeners.clear()
  }
}

/**
 * Simple awareness implementation for cursor positions
 */
class Awareness extends EventEmitter {
  constructor(doc) {
    super()
    this.doc = doc
    this.states = new Map()
    this.clientID = doc.peerIdToFrontendId(doc.peerId())
  }

  getStates() {
    return this.states
  }

  getLocalState() {
    return this.states.get(this.clientID)
  }

  setLocalState(state) {
    if (state === null) {
      this.states.delete(this.clientID)
    } else {
      this.states.set(this.clientID, state)
    }
    this.emit('update', {
      added: [this.clientID],
      updated: [],
      removed: state === null ? [this.clientID] : []
    })
  }

  updateRemoteState(clientID, state) {
    if (state === null) {
      this.states.delete(clientID)
      this.emit('update', { added: [], updated: [], removed: [clientID] })
    } else {
      const wasPresent = this.states.has(clientID)
      this.states.set(clientID, state)
      this.emit('update', {
        added: wasPresent ? [] : [clientID],
        updated: wasPresent ? [clientID] : [],
        removed: []
      })
    }
  }
}

/**
 * Encode a message for the Loro WebSocket protocol
 */
const encodeMessage = (type, data) => {
  const typeArray = new Uint8Array([type])
  if (!data) {
    return typeArray
  }
  const result = new Uint8Array(typeArray.length + data.length)
  result.set(typeArray, 0)
  result.set(data, typeArray.length)
  return result
}

/**
 * Decode a message from the Loro WebSocket protocol
 */
const decodeMessage = (buf) => {
  if (buf.length === 0) return null
  const type = buf[0]
  const data = buf.length > 1 ? buf.slice(1) : null
  return { type, data }
}

/**
 * Handle incoming messages
 */
const readMessage = (provider, buf, emitSynced) => {
  const message = decodeMessage(buf)
  if (!message) return null

  switch (message.type) {
    case MESSAGE_SYNC: {
      if (message.data) {
        // Apply the update to the document
        provider.doc.import(message.data)
        if (emitSynced && !provider.synced) {
          provider.synced = true
        }
      }
      // Send our current state back
      return encodeMessage(MESSAGE_SYNC, provider.doc.exportFrom())
    }
    case MESSAGE_AWARENESS: {
      if (message.data) {
        try {
          const awarenessData = JSON.parse(new TextDecoder().decode(message.data))
          for (const [clientID, state] of Object.entries(awarenessData)) {
            provider.awareness.updateRemoteState(parseInt(clientID), state)
          }
        } catch (e) {
          console.error('Failed to parse awareness data:', e)
        }
      }
      break
    }
    default:
      console.error('Unknown message type:', message.type)
      return null
  }
  return null
}

/**
 * Setup WebSocket connection
 */
const setupWS = provider => {
  if (provider.shouldConnect && provider.ws === null) {
    const websocket = new provider._WS(provider.url)
    websocket.binaryType = 'arraybuffer'
    provider.ws = websocket
    provider.wsconnecting = true
    provider.wsconnected = false
    provider.synced = false

    websocket.onmessage = event => {
      provider.wsLastMessageReceived = Date.now()
      const response = readMessage(provider, new Uint8Array(event.data), true)
      if (response) {
        websocket.send(response)
      }
    }

    websocket.onclose = () => {
      provider.ws = null
      provider.wsconnecting = false
      if (provider.wsconnected) {
        provider.wsconnected = false
        provider.synced = false
        // Clear remote awareness states
        for (const clientID of provider.awareness.getStates().keys()) {
          if (clientID !== provider.awareness.clientID) {
            provider.awareness.updateRemoteState(clientID, null)
          }
        }
        provider.emit('status', [{ status: 'disconnected' }])
      } else {
        provider.wsUnsuccessfulReconnects++
      }
      // Exponential backoff reconnection
      const timeout = Math.min(
        Math.log10(provider.wsUnsuccessfulReconnects + 1) * reconnectTimeoutBase,
        maxReconnectTimeout
      )
      setTimeout(() => setupWS(provider), timeout)
    }

    websocket.onopen = () => {
      provider.wsLastMessageReceived = Date.now()
      provider.wsconnecting = false
      provider.wsconnected = true
      provider.wsUnsuccessfulReconnects = 0
      provider.emit('status', [{ status: 'connected' }])
      
      // Send initial sync message
      const syncMessage = encodeMessage(MESSAGE_SYNC, provider.doc.exportFrom())
      websocket.send(syncMessage)
      
      // Send local awareness state
      if (provider.awareness.getLocalState() !== null) {
        const awarenessData = JSON.stringify({
          [provider.awareness.clientID]: provider.awareness.getLocalState()
        })
        const awarenessMessage = encodeMessage(
          MESSAGE_AWARENESS,
          new TextEncoder().encode(awarenessData)
        )
        websocket.send(awarenessMessage)
      }
    }

    provider.emit('status', [{ status: 'connecting' }])
  }
}

/**
 * Broadcast message to WebSocket
 */
const broadcastMessage = (provider, buf) => {
  if (provider.wsconnected && provider.ws) {
    provider.ws.send(buf)
  }
}

/**
 * WebSocket Provider for Loro. Creates a websocket connection to sync the shared document.
 */
export class WebsocketProvider extends EventEmitter {
  /**
   * @param {string} serverUrl
   * @param {string} roomname
   * @param {LoroDoc} doc
   * @param {object} [opts]
   * @param {boolean} [opts.connect]
   * @param {Awareness} [opts.awareness]
   * @param {Object<string,string>} [opts.params]
   * @param {typeof WebSocket} [opts.WebSocketPolyfill]
   * @param {number} [opts.resyncInterval]
   */
  constructor(
    serverUrl,
    roomname,
    doc,
    {
      connect = true,
      awareness = new Awareness(doc),
      params = {},
      WebSocketPolyfill = WebSocket,
      resyncInterval = -1
    } = {}
  ) {
    super()
    
    // Ensure URL doesn't end with /
    while (serverUrl[serverUrl.length - 1] === '/') {
      serverUrl = serverUrl.slice(0, serverUrl.length - 1)
    }
    
    // Build URL with params
    const urlParams = new URLSearchParams(params)
    const queryString = urlParams.toString()
    this.url = serverUrl + '/' + roomname + (queryString ? '?' + queryString : '')
    this.roomname = roomname
    this.doc = doc
    this._WS = WebSocketPolyfill
    this.awareness = awareness
    this.wsconnected = false
    this.wsconnecting = false
    this.wsUnsuccessfulReconnects = 0
    this._synced = false
    this.ws = null
    this.wsLastMessageReceived = 0
    this.shouldConnect = connect

    // Setup resync interval
    this._resyncInterval = 0
    if (resyncInterval > 0) {
      this._resyncInterval = setInterval(() => {
        if (this.ws && this.wsconnected) {
          const syncMessage = encodeMessage(MESSAGE_SYNC, doc.exportFrom())
          this.ws.send(syncMessage)
        }
      }, resyncInterval)
    }

    // Listen to document updates
    this._updateHandler = (event) => {
      if (event.by !== 'local') return // Only broadcast local changes
      
      const update = this.doc.exportFrom(event.from)
      const message = encodeMessage(MESSAGE_SYNC, update)
      broadcastMessage(this, message)
    }
    this.doc.subscribe(this._updateHandler)

    // Listen to awareness updates
    this._awarenessUpdateHandler = ({ added, updated, removed }) => {
      const changedClients = [...added, ...updated, ...removed]
      if (changedClients.length > 0) {
        const awarenessData = JSON.stringify({
          [this.awareness.clientID]: this.awareness.getLocalState()
        })
        const message = encodeMessage(
          MESSAGE_AWARENESS,
          new TextEncoder().encode(awarenessData)
        )
        broadcastMessage(this, message)
      }
    }
    awareness.on('update', this._awarenessUpdateHandler)

    // Cleanup on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        awareness.setLocalState(null)
      })
    }

    // Periodic connection check
    this._checkInterval = setInterval(() => {
      if (
        this.wsconnected &&
        messageReconnectTimeout < Date.now() - this.wsLastMessageReceived
      ) {
        this.ws?.close()
      }
    }, messageReconnectTimeout / 10)

    if (connect) {
      this.connect()
    }
  }

  get synced() {
    return this._synced
  }

  set synced(state) {
    if (this._synced !== state) {
      this._synced = state
      this.emit('sync', [state])
    }
  }

  destroy() {
    if (this._resyncInterval !== 0) {
      clearInterval(this._resyncInterval)
    }
    clearInterval(this._checkInterval)
    this.disconnect()
    this.awareness.off('update', this._awarenessUpdateHandler)
    this.doc.unsubscribe(this._updateHandler)
    super.destroy()
  }

  disconnect() {
    this.shouldConnect = false
    if (this.ws !== null) {
      this.ws.close()
    }
  }

  connect() {
    this.shouldConnect = true
    if (!this.wsconnected && this.ws === null) {
      setupWS(this)
    }
  }
}
