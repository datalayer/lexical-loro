import {LoroDoc, EphemeralStore} from 'loro-crdt'
import * as map from 'lib0/map'
import * as eventloop from 'lib0/eventloop'
import { callbackHandler, isCallbackSet } from './callback'

// Loro message types
interface LoroUpdateMessage {
  type: 'loro-update'
  update: number[]
  docId: string
}

interface SnapshotMessage {
  type: 'snapshot'
  snapshot: number[]
  docId: string
}

interface EphemeralMessage {
  type: 'ephemeral'
  ephemeral: number[]
  docId: string
}

interface QueryEphemeralMessage {
  type: 'query-ephemeral'
  docId: string
}

type LoroWebSocketMessage = LoroUpdateMessage | SnapshotMessage | EphemeralMessage | QueryEphemeralMessage


const CALLBACK_DEBOUNCE_WAIT = parseInt(process.env.CALLBACK_DEBOUNCE_WAIT || '2000')
const CALLBACK_DEBOUNCE_MAXWAIT = parseInt(process.env.CALLBACK_DEBOUNCE_MAXWAIT || '10000')

const debouncer = eventloop.createDebouncer(CALLBACK_DEBOUNCE_WAIT, CALLBACK_DEBOUNCE_MAXWAIT)

const wsReadyStateConnecting = 0
const wsReadyStateOpen = 1
const wsReadyStateClosing = 2 // eslint-disable-line
const wsReadyStateClosed = 3 // eslint-disable-line

const persistenceDir = process.env.YPERSISTENCE

/**
 * @type {{bindState: function(string,WSSharedDoc):void, writeState:function(string,WSSharedDoc):Promise<any>, provider: any}|null}
 */
let persistence = null
if (typeof persistenceDir === 'string') {
  console.info('Persisting documents to "' + persistenceDir + '"')
  // @ts-ignore
  // Note: Using simplified persistence for Loro - replace with actual Loro-compatible persistence
  persistence = {
    provider: null, // Replace with Loro-compatible persistence provider
    bindState: async (docName, doc: WSSharedDoc) => {
      // TODO: Implement Loro document persistence
      // For now, just log the operation
      console.log(`Binding state for document: ${docName}`)
    },
    writeState: async (docName, doc: WSSharedDoc) => {
      // TODO: Implement Loro document state writing
      console.log(`Writing state for document: ${docName}`)
    }
  }
}

/**
 * @param {{bindState: function(string,WSSharedDoc):void,
 * writeState:function(string,WSSharedDoc):Promise<any>,provider:any}|null} persistence_
 */
export const setPersistence = persistence_ => {
  persistence = persistence_
}

/**
 * @return {null|{bindState: function(string,WSSharedDoc):void,
  * writeState:function(string,WSSharedDoc):Promise<any>}|null} used persistence layer
  */
export const getPersistence = () => persistence

/**
 * @type {Map<string,WSSharedDoc>}
 */
export const docs = new Map<string, WSSharedDoc>()

const messageLoroUpdate = 'loro-update'
const messageSnapshot = 'snapshot'
const messageEphemeral = 'ephemeral'
const messageQueryEphemeral = 'query-ephemeral'

/**
 * Handle Loro document updates and broadcast to connected clients (excluding sender)
 * @param {Uint8Array} update
 * @param {any} senderConn - The connection that sent the update (to exclude from broadcast)
 * @param {WSSharedDoc} doc
 */
const updateHandler = (update: Uint8Array, senderConn: any, doc: WSSharedDoc) => {
  console.info(`[Server] updateHandler - Broadcasting document update:`, {
    docName: doc.name,
    updateSize: update.length,
    connectedClients: doc.conns.size,
    senderConn: !!senderConn,
    updatePreview: Array.from(update.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ')
  })
  
  const message: LoroUpdateMessage = {
    type: messageLoroUpdate,
    update: Array.from(update),
    docId: doc.name
  }
  const messageData = new TextEncoder().encode(JSON.stringify(message))
  
  // Broadcast to all connected clients except the sender
  let broadcastCount = 0
  doc.conns.forEach((_, conn) => {
    if (conn !== senderConn) {
      send(doc, conn, messageData)
      broadcastCount++
    }
  })
  
  console.info(`[Server] updateHandler - Update broadcasted to ${broadcastCount} other clients (excluding sender)`)
  
  // Trigger callback if configured
  if (isCallbackSet) {
    debouncer(() => callbackHandler(doc))
  }
}

/**
 * @type {(ydoc: Y.Doc) => Promise<void>}
 */
let contentInitializor = _ydoc => Promise.resolve()

/**
 * This function is called once every time a CRDT document is created. You can
 * use it to pull data from an external source or initialize content.
 *
 * @param {(ydoc: Y.Doc) => Promise<void>} f
 */
export const setContentInitializor = (f) => {
  contentInitializor = f
}

export class WSSharedDoc {
  name: string
  doc: LoroDoc
  connections: Map<any, Set<string>>
  ephemeralStore: EphemeralStore
  conns: Map<any, Set<any>>
  private _conns: Set<any>

  constructor (name) {
    this.name = name
    this.doc = new LoroDoc()
    /**
     * Maps from conn to set of controlled ephemeral keys. Delete all keys when this conn is closed
     * @type {Map<Object, Set<string>>}
     */
    this.connections = new Map()
    this.conns = new Map()
    this._conns = new Set()
    /**
     * @type {EphemeralStore}
     */
    this.ephemeralStore = new EphemeralStore(30000) // 30 second timeout
    
    console.info(`[Server] WSSharedDoc created: ${name}`)
    
    /**
     * @type {Array<function>}
     */
    const ephemeralChangeHandler = (event) => {
      // Only broadcast if there are actual changes
      if (event.added.length > 0 || event.updated.length > 0 || event.removed.length > 0) {
        try {
          const encodedData = this.ephemeralStore.encodeAll()
          const message: EphemeralMessage = {
            type: messageEphemeral,
            ephemeral: Array.from(encodedData),
            docId: name
          }
          const messageData = new TextEncoder().encode(JSON.stringify(message))
          
          this.connections.forEach((_, c) => {
            send(this, c, messageData)
          })
        } catch (broadcastError) {
          console.error(`[Server] ephemeralChangeHandler - ERROR:`, broadcastError.message)
        }
      }
    }
    this.ephemeralStore.subscribe(ephemeralChangeHandler)
    // Note: LoroDoc doesn't have 'on' method like Y.Doc
    // Update handling will be done through message processing
  }
}

/**
 * Gets a Y.Doc by name, whether in memory or on disk
 *
 * @param {string} docname - the name of the Y.Doc to find or create
 * @return {WSSharedDoc}
 */
export const getYDoc = (docname) => map.setIfUndefined(docs, docname, () => {
  const doc = new WSSharedDoc(docname)
  // Note: LoroDoc doesn't have gc property - garbage collection is handled differently
  if (persistence !== null) {
    persistence.bindState(docname, doc)
  }
  docs.set(docname, doc)
  return doc
})

/**
 * @param {any} conn
 * @param {WSSharedDoc} doc
 * @param {Uint8Array} message
 */
const messageListener = (conn, doc: WSSharedDoc, message) => {
  try {
    // Handle empty messages
    if (message.length === 0) {
      return
    }
    
    const messageStr = new TextDecoder().decode(message)
    
    // Handle empty string after decoding
    if (messageStr.length === 0) {
      return
    }
    
    const messageData: LoroWebSocketMessage = JSON.parse(messageStr)
    
    switch (messageData.type) {
      case messageLoroUpdate:
        console.info(`[Server] messageLoroUpdate - Received update from client:`, {
          docName: doc.name,
          updateSize: messageData.update.length,
          connectedClients: doc.conns.size
        })
        
        // Apply the Loro update to the document
        const updateData = messageData as LoroUpdateMessage;
        const updateBytes = new Uint8Array(updateData.update)
        doc.doc.import(updateBytes)
        
        // Use updateHandler to broadcast to all other clients (excluding sender)
        updateHandler(updateBytes, conn, doc)
        break
        
      case messageSnapshot:
        // Send current document snapshot to requesting client
        const snapshot = doc.doc.export({ mode: 'snapshot' })
        const response: SnapshotMessage = {
          type: messageSnapshot,
          snapshot: Array.from(snapshot),
          docId: doc.name
        }
        send(doc, conn, new TextEncoder().encode(JSON.stringify(response)))
        break
        
      case messageEphemeral:
        // Apply ephemeral update
        const ephemeralData = messageData as EphemeralMessage;
        try {
          const ephemeralBytes = new Uint8Array(ephemeralData.ephemeral)
          doc.ephemeralStore.apply(ephemeralBytes)
        } catch (ephemeralError) {
          console.error(`[Server] messageEphemeral - ERROR applying ephemeral update:`, ephemeralError.message)
        }
        break
        
      case messageQueryEphemeral:
        // Send current ephemeral state to requesting client
        try {
          const ephemeralUpdate = doc.ephemeralStore.encodeAll()
          const ephemeralResponse: EphemeralMessage = {
            type: messageEphemeral,
            ephemeral: Array.from(ephemeralUpdate),
            docId: doc.name
          }
          send(doc, conn, new TextEncoder().encode(JSON.stringify(ephemeralResponse)))
        } catch (queryError) {
          console.error(`[Server] messageQueryEphemeral - ERROR:`, queryError.message)
        }
        break
    }
  } catch (err) {
    console.error(err)
    // Note: LoroDoc doesn't have emit method, using console.error instead
    console.error('Message handling error:', err)
  }
}

/**
 * @param {WSSharedDoc} doc
 * @param {any} conn
 */
const closeConn = (doc, conn) => {
  if (doc.conns.has(conn)) {
    /**
     * @type {Set<string>}
     */
    // @ts-ignore
    const controlledKeys = doc.conns.get(conn)
    doc.conns.delete(conn)
    // Remove ephemeral state controlled by this connection
    if (controlledKeys) {
      controlledKeys.forEach(key => {
        doc.ephemeralStore.delete(key)
      })
    }
    if (doc.conns.size === 0 && persistence !== null) {
      // if persisted, we store state and cleanup document
      persistence.writeState(doc.name, doc).then(() => {
        // Cleanup WSSharedDoc resources (no destroy method needed for Loro)
        console.log(`[Server] Cleaning up document: ${doc.name}`)
      })
      docs.delete(doc.name)
    }
  }
  conn.close()
}

/**
 * @param {WSSharedDoc} doc
 * @param {import('ws').WebSocket} conn
 * @param {Uint8Array} m
 */
const send = (doc: WSSharedDoc, conn, m) => {
  if (conn.readyState === wsReadyStateClosing || conn.readyState === wsReadyStateClosed) {
    closeConn(doc, conn)
    return
  }
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    closeConn(doc, conn)
    return
  }
  try {
    conn.send(m, {}, err => { err != null && closeConn(doc, conn) })
  } catch (e) {
    closeConn(doc, conn)
  }
}

const pingTimeout = 30000

/**
 * @param {import('ws').WebSocket} conn
 * @param {import('http').IncomingMessage} req
 * @param {any} opts
 */
export const setupWSConnection = (conn, req, { docName = (req.url || '').slice(1).split('?')[0] } = {}) => {
  conn.binaryType = 'arraybuffer'
  // get doc, initialize if it does not exist yet
  const doc = getYDoc(docName)
  doc.conns.set(conn, new Set())
  // listen and reply to events
  conn.on('message', /** @param {ArrayBuffer|string} message */ message => {
    // Handle both string and binary messages
    let messageData: Uint8Array
    if (typeof message === 'string') {
      messageData = new TextEncoder().encode(message)
    } else if (message instanceof ArrayBuffer) {
      messageData = new Uint8Array(message)
    } else {
      messageData = new Uint8Array(message)
    }
    messageListener(conn, doc, messageData)
  })

  // Check if connection is still alive
  let pongReceived = true
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) {
        closeConn(doc, conn)
      }
      clearInterval(pingInterval)
    } else if (doc.conns.has(conn)) {
      pongReceived = false
      try {
        conn.ping()
      } catch (e) {
        closeConn(doc, conn)
        clearInterval(pingInterval)
      }
    }
  }, pingTimeout)
  conn.on('close', () => {
    closeConn(doc, conn)
    clearInterval(pingInterval)
  })
  conn.on('pong', () => {
    pongReceived = true
  })
  // put the following in a variables in a block so the interval handlers don't keep in scope
  {
    // Send initial snapshot to new client
    const snapshot = doc.doc.export({ mode: 'snapshot' })
    const snapshotMessage: SnapshotMessage = {
      type: messageSnapshot,
      snapshot: Array.from(snapshot),
      docId: docName
    }
    send(doc, conn, new TextEncoder().encode(JSON.stringify(snapshotMessage)))
    
    // Send current ephemeral state if any
    const ephemeralUpdate = doc.ephemeralStore.encodeAll()
    if (ephemeralUpdate.length > 0) {
      const ephemeralMessage: EphemeralMessage = {
        type: messageEphemeral,
        ephemeral: Array.from(ephemeralUpdate),
        docId: docName
      }
      send(doc, conn, new TextEncoder().encode(JSON.stringify(ephemeralMessage)))
    }
  }
}
