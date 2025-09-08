import { LoroDoc } from 'loro-crdt'

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
 * Handle incoming messages - simplified to just apply updates from Loro
 */
const readMessage = (provider, data, emitSynced) => {
  try {
    // Assume all messages are Loro updates and apply them directly
    provider.doc.import(data)
    if (emitSynced && !provider.synced) {
      provider.synced = true
    }
  } catch (e) {
    console.error('Failed to apply Loro update:', e)
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
      readMessage(provider, new Uint8Array(event.data), true)
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
      
      // Send initial document state
      const currentState = provider.doc.exportFrom()
      if (currentState.length > 0) {
        websocket.send(currentState)
      }
    }

    provider.emit('status', [{ status: 'connecting' }])
  }
}

/**
 * Broadcast message to WebSocket
 */
const broadcastMessage = (provider, data) => {
  if (provider.wsconnected && provider.ws) {
    provider.ws.send(data)
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
          const currentState = doc.exportFrom()
          if (currentState.length > 0) {
            this.ws.send(currentState)
          }
        }
      }, resyncInterval)
    }

    // Listen to document updates
    this._updateHandler = (event) => {
      if (event.by !== 'local') return // Only broadcast local changes
      
      const update = this.doc.exportFrom(event.from)
      broadcastMessage(this, update)
    }
    this.doc.subscribe(this._updateHandler)

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
