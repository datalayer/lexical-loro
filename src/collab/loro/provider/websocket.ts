import { LoroDoc, EphemeralStore, EphemeralStoreEvent, VersionVector } from 'loro-crdt'
import { ObservableV2 } from 'lib0/observable'
import * as bc from 'lib0/broadcastchannel'
import * as time from 'lib0/time'
import * as math from 'lib0/math'
import * as url from 'lib0/url'
import * as env from 'lib0/environment'
import type { UserState, AwarenessProvider } from '../State'
import { generateClientID, generateRandomClientID } from '../utils/Utils'

// @todo - this should depend on ephemeral timeout
const messageReconnectTimeoutMs = 30000 * 1000 // 30 * 1000 seconds

// Loro message types
export const messageUpdate = 'update'
export const messageQuerySnapshot = 'query-snapshot'
export const messageEphemeral = 'ephemeral'
export const messageQueryEphemeral = 'query-ephemeral'

// Message type definitions
export interface LoroUpdateMessage {
  type: 'update'
  update: number[]
  docId: string
}

export interface EphemeralMessage {
  type: 'ephemeral'
  ephemeral: number[]
  docId: string
}

export interface QueryEphemeralMessage {
  type: 'query-ephemeral'
  docId: string
}

export interface QuerySnapshotMessage {
  type: 'query-snapshot'
  docId: string
}

export type LoroWebSocketMessage = LoroUpdateMessage | EphemeralMessage | QueryEphemeralMessage | QuerySnapshotMessage;

/**
 * Awareness adapter that wraps EphemeralStore to provide awareness-like API
 */
class AwarenessAdapter implements AwarenessProvider {
  private ephemeralStore: EphemeralStore
  private localClientId: number
  private eventHandlers: Map<string, (() => void)[]> = new Map()

  constructor(ephemeralStore: EphemeralStore, doc?: LoroDoc) {
    this.ephemeralStore = ephemeralStore
    // Use the same client ID as the binding for consistency
    this.localClientId = doc ? generateClientID(doc) : generateRandomClientID()
    
    console.log('🔄 AwarenessAdapter created:', {
      localClientId: this.localClientId,
      docPeerId: doc ? doc.peerId : 'no-doc',
      existingStatesCount: Object.keys(ephemeralStore.getAllStates()).length
    });
    
    // Subscribe to ephemeral store changes and emit awareness updates
    this.ephemeralStore.subscribe((event) => {
      // Emit update events when ephemeral state changes
      const updateHandlers = this.eventHandlers.get('update') || []
      updateHandlers.forEach(integrater => integrater())
    })
  }

  getLocalState(): UserState | null {
    const localKey = `user-${this.localClientId}`
    
    try {
      const state = this.ephemeralStore.get(localKey)
      return state ? state as UserState : null
    } catch (error) {
      console.warn(`[Client] AwarenessAdapter.getLocalState() - ephemeralStore.get() FAILED:`, {
        error: error.message,
        stack: error.stack,
        localKey,
        peerId: this.localClientId,
        storeExists: !!this.ephemeralStore
      })
      throw error
    }
  }

  getStates(): Map<number, UserState> {
    const states = new Map<number, UserState>()
    
    try {
      // Get all states from ephemeral store
      const allStates = this.ephemeralStore.getAllStates()
      
      // Clean up stale states periodically (very rarely to avoid performance issues)
      if (Math.random() < 0.001) { // ~0.1% chance per call
        this.cleanupStaleStates(allStates)
      }
      
      // Iterate through all keys and extract user states
      for (const [key, value] of Object.entries(allStates)) {
        if (key.startsWith('user-')) {
          // Extract client ID from key format "user-{clientId}"
          const clientIdStr = key.substring(5) // Remove "user-" prefix
          const clientId = parseInt(clientIdStr, 10)
          
          if (!isNaN(clientId) && value) {
            states.set(clientId, value as UserState)
          }
        }
      }
    } catch (error) {
      console.warn(`[Client] AwarenessAdapter.getStates() - ERROR:`, error.message)
      // Fallback to just local state
      const localState = this.getLocalState()
      if (localState) {
        states.set(this.localClientId, localState)
      }
    }
    
    return states
  }

  private cleanupStaleStates(allStates: Record<string, any>): void {
    const currentTime = Date.now()
    const staleThreshold = 5 * 60 * 1000 // 5 minutes
    
    try {
      for (const [key, value] of Object.entries(allStates)) {
        if (key.startsWith('user-') && value && typeof value === 'object') {
          const state = value as UserState
          const lastActivity = typeof state.lastActivity === 'number' ? state.lastActivity : 0
          
          // Remove states that haven't been active for more than the threshold
          if (typeof lastActivity === 'number' && currentTime - lastActivity > staleThreshold) {
            console.log('Cleaning up stale user state:', key, 'last activity:', new Date(lastActivity).toISOString())
            this.ephemeralStore.delete(key)
          }
        }
      }
    } catch (error) {
      console.warn('Error during stale state cleanup:', error.message)
    }
  }

  setLocalState(state: UserState): void {
    const localKey = `user-${this.localClientId}`
    
    // Add lastActivity timestamp for stale state cleanup
    const stateWithActivity = {
      ...state,
      lastActivity: Date.now()
    }

    try {
      this.ephemeralStore.set(localKey, stateWithActivity as any)
    } catch (error) {
      console.warn(`[Client] AwarenessAdapter.setLocalState() - ephemeralStore.set() FAILED:`, {
        error: error.message,
        stack: error.stack,
        localKey,
        peerId: this.localClientId,
        stateKeys: Object.keys(state || {}),
        storeExists: !!this.ephemeralStore
      })
      throw error
    }
  }

  setLocalStateField(field: string, value: unknown): void {
    const localState = this.getLocalState() || {
      anchorPos: null,
      awarenessData: {},
      color: '#000000',
      focusPos: null,
      focusing: false,
      name: 'Anonymous',
    }
    localState[field] = value
    this.setLocalState(localState)
  }

  on(type: 'update', cb: () => void): void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, [])
    }
    this.eventHandlers.get(type)!.push(cb)
  }

  off(type: 'update', cb: () => void): void {
    const integrators = this.eventHandlers.get(type)
    if (integrators) {
      const index = integrators.indexOf(cb)
      if (index !== -1) {
        integrators.splice(index, 1)
      }
    }
  }

  // Manual cleanup method for debugging
  forceCleanupStaleStates(): void {
    try {
      const allStates = this.ephemeralStore.getAllStates()
      console.log('Force cleanup - total keys before:', Object.keys(allStates).length)
      this.cleanupStaleStates(allStates)
      const newStates = this.ephemeralStore.getAllStates()
      console.log('Force cleanup - total keys after:', Object.keys(newStates).length)
    } catch (error) {
      console.warn('Force cleanup failed:', error.message)
    }
  }
}

/**
 * Message integrators for different Loro message types
 */
const messageHandlers: Record<string, (provider: WebsocketProvider, message: any, emitSynced: boolean) => string | null> = {}



messageHandlers[messageQueryEphemeral] = (
  provider: WebsocketProvider,
  message: QueryEphemeralMessage,
  _emitSynced: boolean
): string | null => {
  try {
    // Use encodeAll() to encode all ephemeral store data
    const encodedData = provider.ephemeralStore.encodeAll()
    
    const response: EphemeralMessage = {
      type: 'ephemeral',
      ephemeral: Array.from(encodedData),
      docId: message.docId
    }
    
    return JSON.stringify(response)
  } catch (error) {
    console.warn('Error in messageQueryEphemeral integrater:', error.message)
    return null
  }
}

messageHandlers[messageEphemeral] = (
  provider: WebsocketProvider,
  message: EphemeralMessage,
  _emitSynced: boolean
): string | null => {
  try {
    // Validate message data before processing
    if (!message.ephemeral || message.ephemeral.length === 0) {
      console.warn(`[Client] messageHandlers[messageEphemeral] - Skipping empty ephemeral data`)
      return null
    }
    
    // Reject obviously corrupted data (too small, common corrupt patterns)
    if (message.ephemeral.length < 8) {
      console.warn(`[Client] messageHandlers[messageEphemeral] - Rejecting suspiciously small ephemeral data:`, message.ephemeral.length)
      return null
    }
    
    // Additional validation - check for specific known bad patterns
    if (message.ephemeral.length === 1) {
      console.warn(`[Client] messageHandlers[messageEphemeral] - Rejecting single-byte ephemeral data (likely corrupted):`, message.ephemeral)
      return null
    }
    
    // Validate ephemeral data format by checking if it starts with reasonable values
    // Ephemeral data should have a structured format - single random bytes are invalid
    const firstBytes = message.ephemeral.slice(0, 4)
    if (firstBytes.every(b => b === 0) || firstBytes.every(b => b === 255)) {
      console.warn(`[Client] messageHandlers[messageEphemeral] - Rejecting ephemeral data with suspicious pattern:`, firstBytes)
      return null
    }
    
    // Apply ephemeral update
    const ephemeralBytes = new Uint8Array(message.ephemeral);

    // Use a try-catch specifically for the apply operation to isolate WASM errors
    try {
      provider.ephemeralStore.apply(ephemeralBytes)
    } catch (applyError) {
      console.warn(`[Client] messageHandlers[messageEphemeral] - WASM apply() failed:`, {
        error: applyError.message,
        ephemeralLength: ephemeralBytes.length,
        ephemeralSample: Array.from(ephemeralBytes.slice(0, 20))
      })
      
      // If this is a WASM memory error, don't attempt any more ephemeral operations
      if (applyError.message && applyError.message.includes('memory access out of bounds')) {
        console.warn(`[Client] messageHandlers[messageEphemeral] - CRITICAL: WASM memory corruption in apply(). Stopping ephemeral processing.`)
        return null
      }
      
      throw applyError // Re-throw if not a WASM error 
    }
    
    return null
  } catch (error) {
    console.warn(`[Client] messageHandlers[messageEphemeral] - ERROR in ephemeral message integrater:`, {
      error: error.message,
      stack: error.stack,
      messageLength: message.ephemeral?.length,
      ephemeralSample: message.ephemeral?.slice(0, 10)
    })
    
    return null
  }
}

messageHandlers[messageUpdate] = (
  provider: WebsocketProvider,
  message: LoroUpdateMessage,
  emitSynced: boolean
): string | null => {

  try {
    // Apply the update to the local document
    const updateBytes = new Uint8Array(message.update)
    
    // Get document state before applying update for comparison
    // const beforeVersion = provider.doc.version()
    
    // Import with sender's peerId as origin to mark as remote update
    // We don't know the actual sender's peerId, so use a generic remote identifier
    // The key point is that it's NOT our local peerId
    const importStatus = provider.doc.import(updateBytes)

    const afterVersion = provider.doc.version()
    
    // Update our last exported version to include the remote changes
    // This ensures we don't re-export remote changes
    provider._lastExportedVersion = afterVersion
    
    if (emitSynced && !provider._synced) {
      provider.synced = true
    }
    
    return null // No response needed
  } catch (error) {
    console.warn(`❌ [LORO-UPDATE-ERROR] Failed to apply Loro update:`, error)
    return null
  }
}

/**
 * @param {WebsocketProvider} provider
 * @param {string} reason
 */
const permissionDeniedIntegrator = (provider, reason) =>
  console.warn(`Permission denied to access ${provider.url}.\n${reason}`)

/**
 * Process incoming message (JSON or binary) and return optional response
 */
const processMessage = (provider: WebsocketProvider, data: string | ArrayBuffer | object, emitSynced: boolean): string | null => {
  if (data instanceof ArrayBuffer) {
    try {
      /*
      // Try to decode as UTF-8 string (JSON messages sent as binary)
      const decoder = new TextDecoder()
      const jsonString = decoder.decode(data)
      const message = JSON.parse(jsonString) as LoroWebSocketMessage
      const messageHandler = messageHandlers[message.type]
      if (messageHandler) {
        return messageHandler(provider, message, emitSynced)
      } else {
        console.warn('Unknown message type:', message.type)
        return null
      }
      */
      // If JSON parsing fails, treat as raw binary Loro update
      const updateBytes = new Uint8Array(data)
      provider.doc.import(updateBytes)
      if (emitSynced && !provider._synced) {
        provider.synced = true
      }
      return null // No response needed for binary updates
    } catch (error) {
      console.warn('Failed to process binary Loro update:', error)
      return null
    }
  }
  else if (typeof data === 'string') {
    try {
      const message = JSON.parse(data) as LoroWebSocketMessage
      const messageHandler = messageHandlers[message.type]
      if (messageHandler) {
        return messageHandler(provider, message, emitSynced)
      } else {
        console.warn('Unknown message type:', message.type)
        return null
      }
    } catch (error) {
      console.warn('Failed to process JSON message:', error)
      return null
    }
  }
  else if (typeof data === 'object' && data !== null) {
    try {
      const message = data as LoroWebSocketMessage
      const messageHandler = messageHandlers[message.type]
      if (messageHandler) {
        return messageHandler(provider, message, emitSynced)
      } else {
        console.warn('Unknown message type:', message.type)
        return null
      }
    } catch (error) {
      console.warn('Failed to process object message:', error)
      return null
    }
  }
  
  console.warn('Unknown message format:', typeof data)
  return null
}

/**
 * Outsource this function so that a new websocket connection is created immediately.
 * I suspect that the `ws.onclose` event is not always fired if there are network issues.
 *
 * @param {WebsocketProvider} provider
 * @param {WebSocket} ws
 * @param {CloseEvent | null} event
 */
const closeWebsocketConnection = (provider, ws, event) => {
  if (ws === provider.ws) {
    provider.emit('connection-close', [event, provider])
    provider.ws = null
    ws.close()
    provider.wsconnecting = false
    if (provider.wsconnected) {
      provider.wsconnected = false
      provider.synced = false
      // Clear local ephemeral state on disconnect
      provider.ephemeralStore.delete('presence')
      provider.ephemeralStore.delete('cursor')
      // Clear user-specific state
      try {
        const peerId = generateClientID(provider.doc)
        const userKey = `user-${peerId}`
        provider.ephemeralStore.delete(userKey)
        console.log('Disconnect cleanup: removed user key:', userKey)
      } catch (error) {
        console.warn('Disconnect cleanup failed:', error.message)
      }
      provider.emit('status', [{
        status: 'disconnected'
      }])
    } else {
      provider.wsUnsuccessfulReconnects++
    }
    // Start with no reconnect timeout and increase timeout by
    // using exponential backoff starting with 100ms
    setTimeout(
      setupWS,
      math.min(
        math.pow(2, provider.wsUnsuccessfulReconnects) * 100,
        provider.maxBackoffTime
      ),
      provider
    )
  }
}

const sendMessage = (ws: WebSocket, message: LoroWebSocketMessage) => {
  if (ws && ws.readyState === ws.OPEN) {
    try {
      const m = JSON.stringify(message);
      ws.send(m)
    } catch (error) {
      console.warn('Failed to send message over WebSocket:', error)
    }
  } else {
    console.warn('WebSocket not open, cannot send message')
  }
}

/**
 * @param {WebsocketProvider} provider
 */
const setupWS = (provider) => {
  if (provider.shouldConnect && provider.ws === null) {
    const ws = new provider._WS(provider.url, provider.protocols)
    ws.binaryType = 'arraybuffer'
    provider.ws = ws
    provider.wsconnecting = true
    provider.wsconnected = false
    provider.synced = false
    ws.onmessage = (event) => {
      provider.wsLastMessageReceived = time.getUnixTime()
      const response = processMessage(provider, event.data, true)
      if (response) {
        // TODO
//        sendMessage(ws, response)
      }
    }
    ws.onerror = (event) => {
      provider.emit('connection-error', [event, provider])
    }
    ws.onclose = (event) => {
      closeWebsocketConnection(provider, ws, event)
    }
    ws.onopen = () => {
      provider.wsLastMessageReceived = time.getUnixTime()
      provider.wsconnecting = false
      provider.wsconnected = true
      provider.wsUnsuccessfulReconnects = 0
      provider.emit('status', [{
        status: 'connected'
      }])
      
      console.log('✅ WebSocket connection established, requesting initial data')
      
      // Since we're in onopen, we know the WebSocket is ready
      // Use sendMessage directly to avoid any race conditions
      
      // Only request snapshot if we haven't already loaded it
      if (!provider.snapshotLoaded) {
        // First request a snapshot to get the initial document state
        const requestId = Math.random().toString(36).substr(2, 9);
        const snapshotRequest: QuerySnapshotMessage = {
          type: 'query-snapshot',
          docId: provider.docId
        }
        console.log(`🔄 Requesting initial snapshot from server (ID: ${requestId}):`, snapshotRequest)
        console.log(`🔄 Provider instance ID: ${provider.wsServerUrl}/${provider.docId}, snapshotLoaded: ${provider.snapshotLoaded}`)
        sendMessage(ws, snapshotRequest)
      } else {
        console.log('📸 Snapshot already loaded, skipping request')
      }
      
      // Then request initial ephemeral state from server  
      const ephemeralRequest: QueryEphemeralMessage = {
        type: 'query-ephemeral',
        docId: provider.docId
      }
      sendMessage(ws, ephemeralRequest)

      // broadcast local ephemeral state if any
      const localState = provider.ephemeralStore.getAllStates()

      if (Object.keys(localState).length > 0) {
        try {
          // Use encodeAll() to encode all ephemeral store data
          const encodedData = provider.ephemeralStore.encodeAll()
          const ephemeralMessage: EphemeralMessage = {
            type: 'ephemeral',
            ephemeral: Array.from(encodedData),
            docId: provider.docId
          }
          sendMessage(ws, ephemeralMessage)
        } catch (error) {
          console.warn(`[Client] setupWS - MAJOR ERROR in ephemeral process:`, {
            error: error.message,
            stack: error.stack,
            localStateKeys: Object.keys(localState),
            storeExists: !!provider.ephemeralStore
          })
        }
      }
    }
    provider.emit('status', [{
      status: 'connecting'
    }])
  }
}

/**
 * Broadcast JSON message to WebSocket and BroadcastChannel
 */
const broadcastMessage = (provider: WebsocketProvider, message: LoroWebSocketMessage) => {
  const ws = provider.ws
  if (provider.wsconnected && ws && ws.readyState === ws.OPEN) {
    sendMessage(ws, message)
  } else {
    console.log('❌ [BROADCAST] WebSocket not ready for sending');
  } 
  
  if (provider.bcconnected) {
    bc.publish(provider.bcChannel, JSON.stringify(message), provider)
  } else {
    console.log('📻 [BROADCAST] BroadcastChannel not connected')
  }
}

/**
 * Websocket Provider for Loro. Creates a websocket connection to sync the shared document.
 * The document name is attached to the provided url. I.e. the following example
 * creates a websocket connection to http://localhost:1235/my-document-name
 */
export class WebsocketProvider extends ObservableV2<any> {
  static globalEphemeralStore: EphemeralStore | null = null
  
  wsServerUrl = ''
  docId = ''
  doc: LoroDoc | null = null
  _WS = null
  protocols = []
  params = {}
  ephemeralStore = null
  awareness = null
  ws = null
  wsconnected = false
  wsconnecting = false
  bcconnected = false
  disableBc = false
  bcChannel = ''
  maxBackoffTime = 2500
  wsUnsuccessfulReconnects = 0
  messageHandlers = []
  _synced = false
  wsLastMessageReceived = 0
  shouldConnect = false
  snapshotLoaded = false
  _checkInterval = null
  _resyncInterval = null
  _updateHandler = null
  _ephemeralUpdateIntegrator = null
  _exitIntegrator = null
  _bcSubscriber = null
  _lastExportedVersion: VersionVector = null  // Track last exported version for incremental updates

  /**
   * @param {string} wsServerUrl
   * @param {string} docId
   * @param {LoroDoc} doc
   * @param {object} opts
   * @param {boolean} [opts.connect]
   * @param {EphemeralStore} [opts.ephemeralStore]
   * @param {Object<string,string>} [opts.params] specify url parameters
   * @param {Array<string>} [opts.protocols] specify websocket protocols
   * @param {typeof WebSocket} [opts.WebSocketPolyfill] Optionally provide a WebSocket polyfill
   * @param {number} [opts.resyncInterval] Request server state every `resyncInterval` milliseconds
   * @param {number} [opts.maxBackoffTime] Maximum amount of time to wait before trying to reconnect (we try to reconnect using exponential backoff)
   * @param {boolean} [opts.disableBc] Disable cross-tab BroadcastChannel communication
   */
  public constructor(wsServerUrl: string, docId: string, doc: LoroDoc, {
    connect = true,
    ephemeralStore = undefined,
    params = {},
    protocols = [],
    WebSocketPolyfill = WebSocket,
    resyncInterval = -1,
    maxBackoffTime = 2500,
    disableBc = false
  } = {}) {
    super()
    // ensure that serverUrl does not end with /
    while (wsServerUrl[wsServerUrl.length - 1] === '/') {
      wsServerUrl = wsServerUrl.slice(0, wsServerUrl.length - 1)
    }
    this.wsServerUrl = wsServerUrl
    this.bcChannel = wsServerUrl + '/' + docId
    this.maxBackoffTime = maxBackoffTime
    /**
     * The specified url parameters. This can be safely updated. The changed parameters will be used
     * when a new connection is established.
     * @type {Object<string,string>}
     */
    this.params = params
    this.protocols = protocols
    this.docId = docId
    this.doc = doc
    this._WS = WebSocketPolyfill
    // Create or reuse persistent ephemeral store for the entire user session
    try {
      if (ephemeralStore) {
        // Use provided ephemeral store (already persistent)
        this.ephemeralStore = ephemeralStore
      } else {
        // Create or reuse global ephemeral store for session persistence
        if (!WebsocketProvider.globalEphemeralStore) {
          WebsocketProvider.globalEphemeralStore = new EphemeralStore(300000) // 5 minute timeout
          console.log('🆕 Created new global EphemeralStore')
        } else {
          console.log('♻️ Reusing existing global EphemeralStore - cleaning up stale user states')
          // Clean up all existing user states when reusing store to prevent accumulation
          const allStates = WebsocketProvider.globalEphemeralStore.getAllStates()
          Object.keys(allStates).forEach(key => {
            if (key.startsWith('user-')) {
              WebsocketProvider.globalEphemeralStore!.delete(key)
              console.log('🧹 Cleaned up stale user state:', key)
            }
          })
        }
        this.ephemeralStore = WebsocketProvider.globalEphemeralStore
      }
      
    } catch (error) {
      console.warn(`[Client] WebsocketProvider constructor - ERROR setting up EphemeralStore:`, {
        error: error.message,
        stack: error.stack,
        docId
      })
      throw error
    }
    
    // Create awareness adapter that wraps ephemeral store
    this.awareness = new AwarenessAdapter(this.ephemeralStore, this.doc)
    this.wsconnected = false
    this.wsconnecting = false
    this.bcconnected = false
    this.disableBc = disableBc
    this.wsUnsuccessfulReconnects = 0
    /**
     * @type {boolean}
     */
    this._synced = false
    /**
     * @type {WebSocket?}
     */
    this.ws = null
    this.wsLastMessageReceived = 0
    /**
     * Whether to connect to other peers or not
     * @type {boolean}
     */
    this.shouldConnect = connect

    /**
     * @type {number}
     */
    this._resyncInterval = 0
    if (resyncInterval > 0) {
      this._resyncInterval = /** @type {any} */ (setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // Request fresh ephemeral state from server
          const queryMessage: QueryEphemeralMessage = {
            type: 'query-ephemeral',
            docId: this.docId
          }
          sendMessage(this.ws, queryMessage)
        }
      }, resyncInterval))
    }

    /**
     * @param {string | object} data
     * @param {any} origin
     */
    this._bcSubscriber = (data: string | object, origin: any) => {
      if (origin !== this) {
        const response = processMessage(this, data, false)
        if (response) {
          bc.publish(this.bcChannel, response, this)
        }
      }
    }
    /**
     * Listens to Loro Loro updates and sends them to remote peers (ws and broadcastchannel)
     * @param {Uint8Array} update
     * @param {any} origin
     */
    this._updateHandler = (update: Uint8Array) => {
      // This integrater is only called for local changes that need to be broadcast
      const updateMessage: LoroUpdateMessage = {
        type: 'update',
        update: Array.from(update),
        docId: this.docId
      }
      
      broadcastMessage(this, updateMessage)
    }
    // Document update integrater - called when Loro emits document change events
    /**
     * @param {EphemeralStoreEvent} event - EphemeralStoreEvent with added, updated, removed arrays
     */
    this._ephemeralUpdateIntegrator = (event: EphemeralStoreEvent) => {
      // Only broadcast if there are actual changes
      if (event.added.length > 0 || event.updated.length > 0 || event.removed.length > 0) {
        try {
          // Use encodeAll() to encode all ephemeral store data
          const encodedData = this.ephemeralStore.encodeAll()
          
          const ephemeralMessage: EphemeralMessage = {
            type: 'ephemeral',
            ephemeral: Array.from(encodedData),
            docId: this.docId
          }
          broadcastMessage(this, ephemeralMessage)
          
        } catch (error) {
          console.warn(`[Client] _ephemeralUpdateIntegrator - ERROR:`, error.message)
          // Fallback: skip this update rather than crash
        }
      }
    }
    this._exitIntegrator = () => {
      // Clear only our local ephemeral state on exit, don't destroy the global store
      if (this.ephemeralStore && this.awareness) {
        try {
          const peerId = generateClientID(this.doc)
          const userKey = `user-${peerId}`
          this.ephemeralStore.delete(userKey)
        } catch (error) {
          console.warn(`[Client] Process exit - Could not clear user state:`, error.message)
        }
      }
    }
    if (env.isNode && typeof process !== 'undefined') {
      process.on('exit', this._exitIntegrator)
    }
    this.ephemeralStore.subscribe(this._ephemeralUpdateIntegrator)
    
    // Initialize the last exported version to current document version
    this._lastExportedVersion = this.doc.version()
    
    // Use Loro's native event system to listen for document changes
    try {
      /*
      this.doc.subscribe((event: LoroEventBatch) => {
        try {
          const afterCommitVersion = this.doc.version()
          const update = this.doc.export({ 
            mode: 'update',
            from: this._lastExportedVersion 
          });

          if (update.length > 0) {
            this._updateHandler(update);
            // Update the last exported version to current version
            this._lastExportedVersion = afterCommitVersion
          } else {
            console.warn(`[WEBSOCKET-PROVIDER] No incremental update available - versions might be the same`);
          }
        } catch (error) {
          console.warn(`[WEBSOCKET-PROVIDER] Error exporting incremental update:`, error);
        }
      });
      */
      this.doc.subscribeLocalUpdates((update: Uint8Array) => {
        try {
          this._updateHandler(update);
        } catch (error) {
          console.warn(`[WEBSOCKET-PROVIDER] Error exporting incremental update:`, error);
        }
      });
    } catch (error) {
      console.warn(`[Client] ERROR setting up Loro document subscription:`, error);
    }
    
    this._checkInterval = (setInterval(() => {
      if (
        this.wsconnected &&
        messageReconnectTimeoutMs <
          time.getUnixTime() - this.wsLastMessageReceived
      ) {
        // no message received in a long time - not even your own ephemeral
        // updates (which are updated every 15 seconds)
        closeWebsocketConnection(this, this.ws, null)
      }
    }, messageReconnectTimeoutMs / 10))
    if (connect) {
      this.connect()
    }
  }

  get url () {
    const encodedParams = url.encodeQueryParams(this.params)
    return this.wsServerUrl + '/' + this.docId +
      (encodedParams.length === 0 ? '' : '?' + encodedParams)
  }

  /**
   * @type {boolean}
   */
  get synced () {
    return this._synced
  }

  set synced (state) {
    if (this._synced !== state) {
      this._synced = state
      super.emit('synced', [state])
      super.emit('sync', [state])
    }
  }

  destroy () {
    if (this._resyncInterval !== 0) {
      clearInterval(this._resyncInterval)
    }
    clearInterval(this._checkInterval)
    this.disconnect()
    if (env.isNode && typeof process !== 'undefined') {
      process.off('exit', this._exitIntegrator)
    }
    // DON'T destroy the ephemeral store - it's shared across the session
    // Only clear our local state from it
    if (this.ephemeralStore && this.awareness) {
      try {
        const peerId = generateClientID(this.doc)
        const userKey = `user-${peerId}`
        this.ephemeralStore.delete(userKey)
      } catch (error) {
        console.warn(`[Client] WebsocketProvider.destroy - Could not clear user state:`, error.message)
      }
    }
    // Note: LoroDoc doesn't have event listeners to remove
    super.destroy()
  }

  connectBc () {
    if (this.disableBc) {
      return
    }
    if (!this.bcconnected) {
      bc.subscribe(this.bcChannel, this._bcSubscriber)
      this.bcconnected = true
    }
    
    // Note: BroadcastChannel snapshot sharing removed - only WebSocket queries supported
    
    // Query ephemeral state from other tabs
    const queryMessage: QueryEphemeralMessage = {
      type: 'query-ephemeral',
      docId: this.docId
    }
    bc.publish(this.bcChannel, JSON.stringify(queryMessage), this)
    
    // Broadcast local ephemeral state using container approach
    const localState = this.ephemeralStore.getAllStates()
    if (Object.keys(localState).length > 0) {
      try {
        // Use encodeAll() to encode all ephemeral store data
        const encodedData = this.ephemeralStore.encodeAll()
        const ephemeralMessage: EphemeralMessage = {
          type: 'ephemeral',
          ephemeral: Array.from(encodedData),
          docId: this.docId
        }
        bc.publish(this.bcChannel, JSON.stringify(ephemeralMessage), this)
        
      } catch (error) {
        console.warn('Error broadcasting ephemeral state in connectBc:', error.message)
      }
    }
  }

  disconnectBc () {
    // broadcast message with local ephemeral state cleared (indicating disconnect)
    this.ephemeralStore.delete('presence')
    this.ephemeralStore.delete('cursor')
    
    // Clear user-specific state
    try {
      const peerId = generateClientID(this.doc)
      const userKey = `user-${peerId}`
      this.ephemeralStore.delete(userKey)
      console.log('Broadcast disconnect cleanup: removed user key:', userKey)
    } catch (error) {
      console.warn('Broadcast disconnect cleanup failed:', error.message)
    }
    
    try {
      // Use encodeAll() to encode ephemeral store data for disconnect broadcast
      const encodedData = this.ephemeralStore.encodeAll()
      const ephemeralMessage: EphemeralMessage = {
        type: 'ephemeral',
        ephemeral: Array.from(encodedData),
        docId: this.docId
      }
      broadcastMessage(this, ephemeralMessage)
      
    } catch (error) {
      console.warn('Error broadcasting disconnect in disconnectBc:', error.message)
    }
    if (this.bcconnected) {
      bc.unsubscribe(this.bcChannel, this._bcSubscriber)
      this.bcconnected = false
    }
  }

  disconnect () {
    this.shouldConnect = false
    this.disconnectBc()
    if (this.ws !== null) {
      closeWebsocketConnection(this, this.ws, null)
    }
  }

  connect () {
    this.shouldConnect = true
    if (!this.wsconnected && this.ws === null) {
      setupWS(this)
      this.connectBc()
    }
  }

  /**
   * Manually send a Loro document update to connected peers
   * Call this method after making changes to the LoroDoc
   * @param {Uint8Array} update The update bytes from LoroDoc
   */
  sendUpdate (update: Uint8Array) {
    this._updateHandler(update, null)
  }

  /**
   * Force cleanup of stale ephemeral states (for debugging)
   * Removes user states that haven't been active for more than 5 minutes
   */
  cleanupStaleStates(): void {
    if (this.awareness && typeof this.awareness.forceCleanupStaleStates === 'function') {
      this.awareness.forceCleanupStaleStates()
    } else {
      console.warn('Cleanup method not available on awareness provider')
    }
  }
}
