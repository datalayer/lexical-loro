/**
 * @module provider/websocket
 */

/* eslint-env browser */

import type {LoroDoc} from 'loro-crdt'
import { EphemeralStore } from 'loro-crdt'
import type { UserState, ProviderAwareness } from '../State'
import * as bc from 'lib0/broadcastchannel'
import * as time from 'lib0/time'
import { ObservableV2 } from 'lib0/observable'
import * as math from 'lib0/math'
import * as url from 'lib0/url'
import * as env from 'lib0/environment'

// Loro message types (JSON-based)
export const messageLoroUpdate = 'loro-update'
export const messageSnapshot = 'snapshot'
export const messageEphemeral = 'ephemeral'
export const messageQueryEphemeral = 'query-ephemeral'

// Message type definitions
export interface LoroUpdateMessage {
  type: 'loro-update'
  update: number[]
  docId: string
}

export interface SnapshotMessage {
  type: 'snapshot'
  snapshot: number[]
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

export type LoroWebSocketMessage = LoroUpdateMessage | SnapshotMessage | EphemeralMessage | QueryEphemeralMessage

/**
 * Awareness adapter that wraps EphemeralStore to provide awareness-like API
 */
class AwarenessAdapter implements ProviderAwareness {
  private ephemeralStore: EphemeralStore
  private localClientId: number
  private eventHandlers: Map<string, (() => void)[]> = new Map()

  constructor(ephemeralStore: EphemeralStore) {
    this.ephemeralStore = ephemeralStore
    this.localClientId = Math.floor(Math.random() * 2147483647) // Random client ID
    
    // Subscribe to ephemeral store changes and emit awareness updates
    this.ephemeralStore.subscribe((event) => {
      // Emit update events when ephemeral state changes
      const updateHandlers = this.eventHandlers.get('update') || []
      updateHandlers.forEach(handler => handler())
    })
  }

  getLocalState(): UserState | null {
    const localKey = `user-${this.localClientId}`
    const state = this.ephemeralStore.get(localKey)
    return state ? state as UserState : null
  }

  getStates(): Map<number, UserState> {
    const states = new Map<number, UserState>()
    
    // In a real implementation, you'd need to track all user keys
    // For now, we'll just add the local state
    const localState = this.getLocalState()
    if (localState) {
      states.set(this.localClientId, localState)
    }
    
    // TODO: Iterate through all ephemeral keys that match user pattern
    // and build the complete states map
    
    return states
  }

  setLocalState(state: UserState): void {
    const localKey = `user-${this.localClientId}`
    this.ephemeralStore.set(localKey, state as any)
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
    const handlers = this.eventHandlers.get(type)
    if (handlers) {
      const index = handlers.indexOf(cb)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }
}

/**
 * Message handlers for different Loro message types
 */
const messageHandlers: Record<string, (provider: WebsocketProvider, message: any, emitSynced: boolean) => string | null> = {}

messageHandlers[messageLoroUpdate] = (
  provider: WebsocketProvider,
  message: LoroUpdateMessage,
  emitSynced: boolean
): string | null => {
  try {
    // Apply the update to the local document
    const updateBytes = new Uint8Array(message.update)
    provider.doc.import(updateBytes)
    
    if (emitSynced && !provider._synced) {
      provider.synced = true
    }
    
    return null // No response needed
  } catch (error) {
    console.error('Failed to apply Loro update:', error)
    return null
  }
}

messageHandlers[messageSnapshot] = (
  provider: WebsocketProvider,
  message: SnapshotMessage,
  emitSynced: boolean
): string | null => {
  try {
    // Import the snapshot into the local document
    const snapshotBytes = new Uint8Array(message.snapshot)
    provider.doc.import(snapshotBytes)
    
    if (emitSynced && !provider._synced) {
      provider.synced = true
    }
    
    return null // No response needed
  } catch (error) {
    console.error('Failed to import Loro snapshot:', error)
    return null
  }
}

messageHandlers[messageQueryEphemeral] = (
  provider: WebsocketProvider,
  message: QueryEphemeralMessage,
  _emitSynced: boolean
): string | null => {
  // Respond with current ephemeral state
  const ephemeralUpdate = provider.ephemeralStore.encodeAll()
  
  const response: EphemeralMessage = {
    type: 'ephemeral',
    ephemeral: Array.from(ephemeralUpdate),
    docId: message.docId
  }
  
  return JSON.stringify(response)
}

messageHandlers[messageEphemeral] = (
  provider: WebsocketProvider,
  message: EphemeralMessage,
  _emitSynced: boolean
): string | null => {
  try {
    // Apply ephemeral update
    provider.ephemeralStore.apply(new Uint8Array(message.ephemeral))
    return null
  } catch (error) {
    console.error('Failed to apply ephemeral update:', error)
    return null
  }
}

// @todo - this should depend on ephemeral timeout
const messageReconnectTimeout = 30000

/**
 * @param {WebsocketProvider} provider
 * @param {string} reason
 */
const permissionDeniedHandler = (provider, reason) =>
  console.warn(`Permission denied to access ${provider.url}.\n${reason}`)

/**
 * Process incoming message (JSON or binary) and return optional response
 */
const readMessage = (provider: WebsocketProvider, data: string | ArrayBuffer, emitSynced: boolean): string | null => {
  // Handle binary data - first try to decode as JSON string, then as raw binary
  if (data instanceof ArrayBuffer) {
    try {
      // Try to decode as UTF-8 string (JSON messages sent as binary)
      const decoder = new TextDecoder()
      const jsonString = decoder.decode(data)
      const message = JSON.parse(jsonString) as LoroWebSocketMessage
      const messageHandler = messageHandlers[message.type]
      
      if (messageHandler) {
        return messageHandler(provider, message, emitSynced)
      } else {
        console.error('Unknown message type:', message.type)
        return null
      }
    } catch (jsonError) {
      // If JSON parsing fails, treat as raw binary Loro update
      try {
        const updateBytes = new Uint8Array(data)
        provider.doc.import(updateBytes)
        
        if (emitSynced && !provider._synced) {
          provider.synced = true
        }
        
        return null // No response needed for binary updates
      } catch (binaryError) {
        console.error('Failed to process binary data as JSON or Loro update:', jsonError, binaryError)
        return null
      }
    }
  }
  
  // Handle string JSON messages
  if (typeof data === 'string') {
    try {
      const message = JSON.parse(data) as LoroWebSocketMessage
      const messageHandler = messageHandlers[message.type]
      
      if (messageHandler) {
        return messageHandler(provider, message, emitSynced)
      } else {
        console.error('Unknown message type:', message.type)
        return null
      }
    } catch (error) {
      console.error('Failed to process JSON message:', error)
      return null
    }
  }
  
  console.error('Unknown message format:', typeof data)
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

/**
 * @param {WebsocketProvider} provider
 */
const setupWS = (provider) => {
  if (provider.shouldConnect && provider.ws === null) {
    const websocket = new provider._WS(provider.url, provider.protocols)
    websocket.binaryType = 'arraybuffer'
    provider.ws = websocket
    provider.wsconnecting = true
    provider.wsconnected = false
    provider.synced = false

    websocket.onmessage = (event) => {
      provider.wsLastMessageReceived = time.getUnixTime()
      const response = readMessage(provider, event.data, true)
      if (response) {
        websocket.send(response)
      }
    }
    websocket.onerror = (event) => {
      provider.emit('connection-error', [event, provider])
    }
    websocket.onclose = (event) => {
      closeWebsocketConnection(provider, websocket, event)
    }
    websocket.onopen = () => {
      provider.wsLastMessageReceived = time.getUnixTime()
      provider.wsconnecting = false
      provider.wsconnected = true
      provider.wsUnsuccessfulReconnects = 0
      provider.emit('status', [{
        status: 'connected'
      }])
      // Request initial ephemeral state from server
      const ephemeralRequest: QueryEphemeralMessage = {
        type: 'query-ephemeral',
        docId: provider.roomname
      }
      websocket.send(JSON.stringify(ephemeralRequest))
      
      // broadcast local ephemeral state if any
      const localState = provider.ephemeralStore.getAllStates()
      if (Object.keys(localState).length > 0) {
        const ephemeralMessage: EphemeralMessage = {
          type: 'ephemeral',
          ephemeral: Array.from(provider.ephemeralStore.encodeAll()),
          docId: provider.roomname
        }
        websocket.send(JSON.stringify(ephemeralMessage))
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
const broadcastMessage = (provider: WebsocketProvider, message: string) => {
  const ws = provider.ws
  if (provider.wsconnected && ws && ws.readyState === ws.OPEN) {
    ws.send(message)
  }
  if (provider.bcconnected) {
    bc.publish(provider.bcChannel, message, provider)
  }
}

/**
 * Websocket Provider for CRDT. Creates a websocket connection to sync the shared document.
 * The document name is attached to the provided url. I.e. the following example
 * creates a websocket connection to http://localhost:1235/my-document-name
 *
 * @example
 *   import * as Y from 'yjs'
 *   import { WebsocketProvider } from 'y-websocket'
 *   const doc = new Y.Doc()
 *   const provider = new WebsocketProvider('http://localhost:1235', 'my-document-name', doc)
 *
 * @extends {ObservableV2<{ 'connection-close': (event: CloseEvent | null,  provider: WebsocketProvider) => any, 'status': (event: { status: 'connected' | 'disconnected' | 'connecting' }) => any, 'connection-error': (event: Event, provider: WebsocketProvider) => any, 'sync': (state: boolean) => any }>}
 */
export class WebsocketProvider extends ObservableV2<any> {
  serverUrl = ''
  roomname = ''
  doc = null
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
  _checkInterval = null
  _resyncInterval = null
  _updateHandler = null
  _ephemeralUpdateHandler = null
  _exitHandler = null
  _bcSubscriber = null

  /**
   * @param {string} serverUrl
   * @param {string} roomname
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
  constructor (serverUrl: string, roomname: string, doc: LoroDoc, {
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
    while (serverUrl[serverUrl.length - 1] === '/') {
      serverUrl = serverUrl.slice(0, serverUrl.length - 1)
    }
    this.serverUrl = serverUrl
    this.bcChannel = serverUrl + '/' + roomname
    this.maxBackoffTime = maxBackoffTime
    /**
     * The specified url parameters. This can be safely updated. The changed parameters will be used
     * when a new connection is established.
     * @type {Object<string,string>}
     */
    this.params = params
    this.protocols = protocols
    this.roomname = roomname
    this.doc = doc
    this._WS = WebSocketPolyfill
    // Create standalone ephemeral store instance if not provided (30 second timeout)
    this.ephemeralStore = ephemeralStore || new EphemeralStore(30000)
    // Create awareness adapter that wraps ephemeral store
    this.awareness = new AwarenessAdapter(this.ephemeralStore)
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
            docId: this.roomname
          }
          this.ws.send(JSON.stringify(queryMessage))
        }
      }, resyncInterval))
    }

    /**
     * @param {string} data
     * @param {any} origin
     */
    this._bcSubscriber = (data: string, origin: any) => {
      if (origin !== this) {
        const response = readMessage(this, data, false)
        if (response) {
          bc.publish(this.bcChannel, response, this)
        }
      }
    }
    /**
     * Listens to Loro CRDT updates and sends them to remote peers (ws and broadcastchannel)
     * @param {Uint8Array} update
     * @param {any} origin
     */
    this._updateHandler = (update: Uint8Array, origin: any) => {
      if (origin !== this) {
        const updateMessage: LoroUpdateMessage = {
          type: 'loro-update',
          update: Array.from(update),
          docId: this.roomname
        }
        broadcastMessage(this, JSON.stringify(updateMessage))
      }
    }
    // Note: LoroDoc doesn't have event listeners like Y.Doc
    // Update handling will be done through manual calls when changes occur
    /**
     * @param {any} event - EphemeralStoreEvent with added, updated, removed arrays
     */
    this._ephemeralUpdateHandler = (event: any) => {
      // Only broadcast if there are actual changes
      if (event.added.length > 0 || event.updated.length > 0 || event.removed.length > 0) {
        const ephemeralMessage: EphemeralMessage = {
          type: 'ephemeral',
          ephemeral: Array.from(this.ephemeralStore.encodeAll()),
          docId: this.roomname
        }
        broadcastMessage(this, JSON.stringify(ephemeralMessage))
      }
    }
    this._exitHandler = () => {
      // Clear all local ephemeral state on exit
      this.ephemeralStore.destroy()
    }
    if (env.isNode && typeof process !== 'undefined') {
      process.on('exit', this._exitHandler)
    }
    this.ephemeralStore.subscribe(this._ephemeralUpdateHandler)
    this._checkInterval = /** @type {any} */ (setInterval(() => {
      if (
        this.wsconnected &&
        messageReconnectTimeout <
          time.getUnixTime() - this.wsLastMessageReceived
      ) {
        // no message received in a long time - not even your own ephemeral
        // updates (which are updated every 15 seconds)
        closeWebsocketConnection(this, /** @type {WebSocket} */ (this.ws), null)
      }
    }, messageReconnectTimeout / 10))
    if (connect) {
      this.connect()
    }
  }

  get url () {
    const encodedParams = url.encodeQueryParams(this.params)
    return this.serverUrl + '/' + this.roomname +
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
      process.off('exit', this._exitHandler)
    }
    // Clean up ephemeral store subscription  
    this.ephemeralStore.destroy()
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
    
    // Send current document snapshot to other tabs
    try {
      const snapshot = this.doc.export({ mode: 'snapshot' })
      const snapshotMessage: SnapshotMessage = {
        type: 'snapshot',
        snapshot: Array.from(snapshot),
        docId: this.roomname
      }
      bc.publish(this.bcChannel, JSON.stringify(snapshotMessage), this)
    } catch (error) {
      console.warn('Failed to export snapshot for BroadcastChannel:', error)
    }
    
    // Query ephemeral state from other tabs
    const queryMessage: QueryEphemeralMessage = {
      type: 'query-ephemeral',
      docId: this.roomname
    }
    bc.publish(this.bcChannel, JSON.stringify(queryMessage), this)
    
    // Broadcast local ephemeral state
    const localState = this.ephemeralStore.getAllStates()
    if (Object.keys(localState).length > 0) {
      const ephemeralMessage: EphemeralMessage = {
        type: 'ephemeral',
        ephemeral: Array.from(this.ephemeralStore.encodeAll()),
        docId: this.roomname
      }
      bc.publish(this.bcChannel, JSON.stringify(ephemeralMessage), this)
    }
  }

  disconnectBc () {
    // broadcast message with local ephemeral state cleared (indicating disconnect)
    this.ephemeralStore.delete('presence')
    this.ephemeralStore.delete('cursor')
    const ephemeralMessage: EphemeralMessage = {
      type: 'ephemeral',
      ephemeral: Array.from(this.ephemeralStore.encodeAll()),
      docId: this.roomname
    }
    broadcastMessage(this, JSON.stringify(ephemeralMessage))
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
}
