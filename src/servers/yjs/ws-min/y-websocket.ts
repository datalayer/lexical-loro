const bc = require('lib0/dist/broadcastchannel.cjs')
const time = require('lib0/dist/time.cjs')
const mutex = require('lib0/dist/mutex.cjs')
const math = require('lib0/dist/math.cjs')
const url = require('lib0/dist/url.cjs')

const Observable = require('lib0/dist/observable.cjs').Observable

const encoding = require('lib0/dist/encoding.cjs')
const decoding = require('lib0/dist/decoding.cjs')
const syncProtocol = require('y-protocols/dist/sync.cjs')

const messageSync = 0
const messageQueryAwareness = 3

const reconnectTimeoutBase = 1200
const maxReconnectTimeout = 2500

const messageReconnectTimeout = 30000


const readMessage = (provider, buf, emitSynced) => {
  const decoder = decoding.createDecoder(buf)
  const encoder = encoding.createEncoder()
  const messageType = decoding.readVarUint(decoder)
  switch (messageType) {
    case messageSync: {
      encoding.writeVarUint(encoder, messageSync)
      const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, provider.doc, provider)
      if (emitSynced && syncMessageType === syncProtocol.messageYjsSyncStep2 && !provider.synced) {
        provider.synced = true
      }
      break
    }
    default:
      console.error('Unable to compute message')
      return encoder
  }
  return encoder
}

const broadcastMessage = (provider, buf) => {
  if (provider.wsconnected) {
    provider.ws.send(buf)
  }
  if (provider.broadcastConnected) {
    provider.mux(() => {
      bc.publish(provider.broadcastChannel, buf)
    })
  }
}

const setupWS = provider => {
  if (provider.shouldConnect && provider.ws === null) {
    const websocket = new provider._WS(provider.url)
    websocket.binaryType = 'arraybuffer'
    provider.ws = websocket
    provider.wsconnecting = true
    provider.wsconnected = false
    provider.synced = false
    websocket.onmessage = event => {
      provider.wsLastMessageReceived = time.getUnixTime()
      const encoder = readMessage(provider, new Uint8Array(event.data), true)
      if (encoding.length(encoder) > 1) {
        websocket.send(encoding.toUint8Array(encoder))
      }
    }
    websocket.onclose = () => {
      provider.ws = null
      provider.wsconnecting = false
      if (provider.wsconnected) {
        provider.wsconnected = false
        provider.synced = false
        provider.emit('status', [{
          status: 'disconnected'
        }])
      } else {
        provider.wsUnsuccessfulReconnects++
      }
      // Start with no reconnect timeout and increase timeout by log10(wsUnsuccessfulReconnects).
      // The idea is to increase reconnect timeout slowly and have no reconnect timeout at the beginning (log(1) = 0)
      setTimeout(setupWS, math.min(math.log10(provider.wsUnsuccessfulReconnects + 1) * reconnectTimeoutBase, maxReconnectTimeout), provider)
    }
    websocket.onopen = () => {
      provider.wsLastMessageReceived = time.getUnixTime()
      provider.wsconnecting = false
      provider.wsconnected = true
      provider.wsUnsuccessfulReconnects = 0
      provider.emit('status', [{
        status: 'connected'
      }])
      // always send sync step 1 when connected
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, messageSync)
      syncProtocol.writeSyncStep1(encoder, provider.doc)
      websocket.send(encoding.toUint8Array(encoder))
    }
    provider.emit('status', [{
      status: 'connecting'
    }])
  }
}

/**
 * Websocket Provider for Yjs.
 * 
 * Creates a websocket connection to sync the shared document.
 * The document name is attached to the provided url.
 * 
 * I.e. the following example creates a websocket connection to http://localhost:1234/my-document-name
 */
export class WebsocketProvider extends Observable { 
  constructor (serverUrl, roomname, doc, { connect = true, params = {}, WebSocketPolyfill = WebSocket, resyncInterval = -1 } = {}) {
    super()
    // ensure that url is always ends with /
    while (serverUrl[serverUrl.length - 1] === '/') {
      serverUrl = serverUrl.slice(0, serverUrl.length - 1)
    }
    const encodedParams = url.encodeQueryParams(params)
    this.broadcastChannel = serverUrl + '/' + roomname
    this.url = serverUrl + '/' + roomname + (encodedParams.length === 0 ? '' : '?' + encodedParams)
    this.roomname = roomname
    this.doc = doc
    this._WS = WebSocketPolyfill
    this.wsconnected = false
    this.wsconnecting = false
    this.broadcastConnected = false
    this.wsUnsuccessfulReconnects = 0
    this.mux = mutex.createMutex()
    this._synced = false
    this.ws = null
    this.wsLastMessageReceived = 0
    this.shouldConnect = connect
    this._resyncInterval = 0
    if (resyncInterval > 0) {
      this._resyncInterval = setInterval(() => {
        if (this.ws) {
          // resend sync step 1
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, messageSync)
          syncProtocol.writeSyncStep1(encoder, doc)
          this.ws.send(encoding.toUint8Array(encoder))
        }
      }, resyncInterval)
    }
    this._broadcastSubscriber = data => {
      this.mux(() => {
        const encoder = readMessage(this, new Uint8Array(data), false)
        if (encoding.length(encoder) > 1) {
          bc.publish(this.broadcastChannel, encoding.toUint8Array(encoder))
        }
      })
    }

    /**
     * Listens to Yjs updates and sends them to remote peers (ws and broadcastchannel)
     */
    this._updateHandler = (update, origin) => {
      if (origin !== this || origin === null) {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageSync)
        syncProtocol.writeUpdate(encoder, update)
        broadcastMessage(this, encoding.toUint8Array(encoder))
      }
    }
    this.doc.on('update', this._updateHandler)
    this._checkInterval = setInterval(() => {
      if (this.wsconnected && messageReconnectTimeout < time.getUnixTime() - this.wsLastMessageReceived) {
        // no message received in a long time - not even your own awareness
        // updates (which are updated every 15 seconds)
        this.ws.close()
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

  private connect() {
    this.shouldConnect = true
    if (!this.wsconnected && this.ws === null) {
      setupWS(this)
      this.connectBroadcast()
    }
  }

  private connectBroadcast() {
    if (!this.broadcastConnected) {
      bc.subscribe(this.broadcastChannel, this._broadcastSubscriber)
      this.broadcastConnected = true
    }
    // send sync step1 to bc
    this.mux(() => {
      // write sync step 1
      const encoderSync = encoding.createEncoder()
      encoding.writeVarUint(encoderSync, messageSync)
      syncProtocol.writeSyncStep1(encoderSync, this.doc)
      bc.publish(this.broadcastChannel, encoding.toUint8Array(encoderSync))
      // broadcast local state
      const encoderState = encoding.createEncoder()
      encoding.writeVarUint(encoderState, messageSync)
      syncProtocol.writeSyncStep2(encoderState, this.doc)
      bc.publish(this.broadcastChannel, encoding.toUint8Array(encoderState))
    })
  }

  private disconnect() {
    this.shouldConnect = false
    this.disconnectBroadcast()
    if (this.ws !== null) {
      this.ws.close()
    }
  }

  private disconnectBroadcast() {
    // broadcast message with local awareness state set to null (indicating disconnect)
    const encoder = encoding.createEncoder()
    broadcastMessage(this, encoding.toUint8Array(encoder))
    if (this.broadcastConnected) {
      bc.unsubscribe(this.broadcastChannel, this._broadcastSubscriber)
      this.broadcastConnected = false
    }
  }

  public destroy() {
    if (this._resyncInterval !== 0) {
      clearInterval(/** @type {NodeJS.Timeout} */ (this._resyncInterval))
    }
    clearInterval(this._checkInterval)
    this.disconnect()
    this.doc.off('update', this._updateHandler)
    super.destroy()
  }

}
