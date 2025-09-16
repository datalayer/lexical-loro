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
const wsReadyStateClosing = 2
const wsReadyStateClosed = 3

const persistenceDir = process.env.YPERSISTENCE

/**
 * @type {{bindState: function(string,WSSharedDoc):void, writeState:function(string,WSSharedDoc):Promise<any>, provider: any}|null}
 */
let persistence = null
if (typeof persistenceDir === 'string') {
  console.log('Persisting documents to "' + persistenceDir + '"')
  // @ts-ignore
  // Note: Using simplified persistence for Loro - replace with actual Loro-compatible persistence
  persistence = {
    provider: null, // Replace with Loro-compatible persistence provider
    bindState: async (docName, doc: WSSharedDoc) => {
      // TODO: Implement Loro document persistence
      // For now, just log the operation
      console.warn(`TODO Binding state for document: ${docName}`)
    },
    writeState: async (docName, doc: WSSharedDoc) => {
      // TODO: Implement Loro document state writing
      console.warn(`TODO Writing state for document: ${docName}`)
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
  lastEphemeralSender: any

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
    
    // Store the last sender to avoid echo loops
    this.lastEphemeralSender = null
    
    /**
     * @type {Array<function>}
     */
    const ephemeralChangeHandler = (event) => {
      // Only broadcast if there are actual changes
      if (event.added.length > 0 || event.updated.length > 0 || event.removed.length > 0) {
        try {
          const encodedData = this.ephemeralStore.encodeAll()
          
          // Skip broadcast if no actual data to send
          if (encodedData.length === 0) {
            return
          }
          
          const message: EphemeralMessage = {
            type: 'ephemeral',
            ephemeral: Array.from(encodedData),
            docId: this.name
          }
          const messageData = new TextEncoder().encode(JSON.stringify(message));          
          // Broadcast to all connections EXCEPT the one that sent the last ephemeral update
          this.conns.forEach((_, c) => {
            if (c !== this.lastEphemeralSender) {
              send(this, c, messageData)
            } else {
              // console.warn(`[Server] ephemeralChangeHandler - Skipping echo back to sender`)
            }
          })
          
          // Clear the sender reference after broadcast
          this.lastEphemeralSender = null
        } catch (broadcastError) {
          console.error(`[Server] ephemeralChangeHandler - ERROR broadcasting:`, {
            error: broadcastError.message,
            stack: broadcastError.stack
          })
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
export const getDoc = (docname) => map.setIfUndefined(docs, docname, () => {
  const doc = new WSSharedDoc(docname)
  if (persistence !== null) {
    persistence.bindState(docname, doc)
  }
  docs.set(docname, doc)
  return doc
})

/**
 * @param {any} conn
 * @param {WSSharedDoc} doc
 * @param {ArrayBuffer | string} message
 */
const messageListener = (conn, doc: WSSharedDoc, message: ArrayBuffer | string | Uint8Array) => {
  try {
    let messageData: LoroWebSocketMessage | null = null
    let messageStr: string = ''
    
    // Handle different message types
    if (typeof message === 'string') {
      // JSON string message
      messageStr = message
    } else if (message instanceof ArrayBuffer) {
      // Binary message (ArrayBuffer)
      try {
        // First try to decode as JSON string
        const decoder = new TextDecoder()
        messageStr = decoder.decode(message)
      } catch (decodeError) {
        console.error(`[Server] messageListener - Failed to decode ArrayBuffer as string, treating as binary Loro update`)
        // If decoding fails, treat as raw binary Loro update
        const updateBytes = new Uint8Array(message)
        doc.doc.import(updateBytes)
        
        // Broadcast the update to other connections
        doc.conns.forEach((_, c) => {
          if (c !== conn) {
            send(doc, c, new Uint8Array(message))
          }
        })
        return
      }
    } else if (message instanceof Uint8Array) {
      // Binary message (Uint8Array)
      try {
        // First try to decode as JSON string
        const decoder = new TextDecoder()
        messageStr = decoder.decode(message);
      } catch (decodeError) {
        console.error(`[Server] messageListener - Failed to decode Uint8Array as string, treating as binary Loro update`)
        // If decoding fails, treat as raw binary Loro update
        doc.doc.import(message);
        
        // Broadcast the update to other connections
        doc.conns.forEach((_, c) => {
          if (c !== conn) {
            send(doc, c, message)
          }
        })
        return
      }
    } else {
      console.error(`[Server] messageListener - Unknown message type:`, typeof message)
      return
    }
    
    // Handle empty messages
    if (!messageStr || messageStr.length === 0) {
      return
    }
    
    // Parse JSON message
    try {
      messageData = JSON.parse(messageStr) as LoroWebSocketMessage
    } catch (parseError) {
      console.error(`[Server] messageListener - JSON parse error:`, parseError.message)
      console.error(`[Server] messageListener - Raw message:`, messageStr.substring(0, 500))
      return
    }
    
    switch (messageData.type) {
      case messageLoroUpdate:
        // Apply the Loro update to the document
        const updateBytes = new Uint8Array(messageData.update)
        doc.doc.import(updateBytes)
        
        // Create properly formatted message for broadcasting
        const broadcastMessage: LoroUpdateMessage = {
          type: 'loro-update',
          update: messageData.update,
          docId: doc.name
        }
        const broadcastData = new TextEncoder().encode(JSON.stringify(broadcastMessage))
        
        // Send the update to all other connections
        let broadcastCount = 0
        console.log(`Total connections for document ${doc.name}: ${doc.conns.size}`)
        doc.conns.forEach((_, c) => {
          if (c !== conn) {
            console.log(`Broadcasting to connection: ${c.id}`)
            send(doc, c, broadcastData)
            broadcastCount++
          } else {
            console.log(`Skipping sender connection: ${c.id}`)
          }
        })
        
        // Trigger callback if configured
        if (isCallbackSet) {
          debouncer(() => callbackHandler(doc))
        }
        break
        
      case messageSnapshot:
        // Send current document snapshot to requesting client
        const snapshot = doc.doc.export({ mode: 'snapshot' })
        const response: SnapshotMessage = {
          type: 'snapshot',
          snapshot: Array.from(snapshot),
          docId: doc.name
        }
        send(doc, conn, new TextEncoder().encode(JSON.stringify(response)))
        break
        
      case messageEphemeral:
        // Apply ephemeral update
        try {
          const ephemeralBytes = new Uint8Array(messageData.ephemeral)
          
          // Mark this connection as the sender to avoid echo
          doc.lastEphemeralSender = conn
          
          doc.ephemeralStore.apply(ephemeralBytes)
        } catch (ephemeralError) {
          console.error(`[Server] messageEphemeral - ERROR applying ephemeral update:`, {
            error: ephemeralError.message,
            stack: ephemeralError.stack,
            ephemeralLength: messageData.ephemeral?.length,
            ephemeralSample: messageData.ephemeral?.slice(0, 10)
          })
          
          // Clear sender reference on error
          doc.lastEphemeralSender = null
        }
        break
        
      case messageQueryEphemeral:
        // Send current ephemeral state to requesting client       
        try {
          const ephemeralUpdate = doc.ephemeralStore.encodeAll()
          
          const ephemeralResponse: EphemeralMessage = {
            type: 'ephemeral',
            ephemeral: Array.from(ephemeralUpdate),
            docId: doc.name
          }
          send(doc, conn, new TextEncoder().encode(JSON.stringify(ephemeralResponse)))
        } catch (queryError) {
          console.error(`[Server] messageQueryEphemeral - ERROR encoding/sending ephemeral state:`, {
            error: queryError.message,
            stack: queryError.stack
          })
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
    console.log(`Closing connection: ${conn.id || 'unknown'} for document: ${doc.name}`)
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
    console.log(`Remaining connections for document ${doc.name}: ${doc.conns.size}`)
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
 * @param {Uint8Array} message
 */
const send = (doc: WSSharedDoc, conn, message) => {
  if (conn.readyState === wsReadyStateClosing || conn.readyState === wsReadyStateClosed) {
    closeConn(doc, conn)
  }
  try {
    // Better logging for message types
    let messageType = 'binary'
    if (message instanceof Uint8Array) {
      try {
        const decoded = new TextDecoder().decode(message)
        const parsed = JSON.parse(decoded)
        messageType = parsed.type || 'json'
      } catch (e) {
        messageType = 'binary-loro'
      }
    }
    console.log(`Sending ${messageType} message to ${conn.id || 'unknown'}`)
    conn.send(message, {}, err => { err != null && closeConn(doc, conn) })
  } catch (e) {
    console.error(e);
    closeConn(doc, conn);
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
  const doc = getDoc(docName)

  // Assign a unique ID to the connection for logging
  conn.id = `conn-${conn._socket?.remoteAddress || 'unknown'}:${conn._socket?.remotePort || Math.random()}`
  console.log(`New connection established: ${conn.id} for document: ${docName} (LoroDoc peerId: ${doc.doc.peerId})`)
  
  doc.conns.set(conn, new Set())
  // listen and reply to events
  conn.on('message', /** @param {ArrayBuffer | string} message */ message => messageListener(conn, doc, message))

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
  // put the following in a variables in a block so the interval handlers don't keep in in
  // scope
  {
    // Send initial snapshot to new client
    const snapshot = doc.doc.export({ mode: 'snapshot' })
    const snapshotMessage: SnapshotMessage = {
      type: 'snapshot',
      snapshot: Array.from(snapshot),
      docId: doc.name
    }
    send(doc, conn, new TextEncoder().encode(JSON.stringify(snapshotMessage)))
    
    // Send current ephemeral state if any
    const ephemeralUpdate = doc.ephemeralStore.encodeAll()
    if (ephemeralUpdate.length > 0) {
      const ephemeralMessage: EphemeralMessage = {
        type: 'ephemeral',
        ephemeral: Array.from(ephemeralUpdate),
        docId: doc.name
      }
      send(doc, conn, new TextEncoder().encode(JSON.stringify(ephemeralMessage)))
    }
  }
}
