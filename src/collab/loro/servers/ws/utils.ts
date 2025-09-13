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
 * Handle Loro document updates and broadcast to connected clients
 * @param {Uint8Array} update
 * @param {any} _origin
 * @param {WSSharedDoc} doc
 */
const updateHandler = (update: Uint8Array, _origin: any, doc: WSSharedDoc) => {
  const message: LoroUpdateMessage = {
    type: messageLoroUpdate,
    update: Array.from(update),
    docId: doc.name
  }
  const messageData = new TextEncoder().encode(JSON.stringify(message))
  doc.conns.forEach((_, conn) => send(doc, conn, messageData))
  
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
    console.log(`[Server] WSSharedDoc constructor - Creating EphemeralStore for doc:`, name)
    this.ephemeralStore = new EphemeralStore(30000) // 30 second timeout
    console.log(`[Server] WSSharedDoc constructor - EphemeralStore created successfully`)
    
    /**
     * @type {Array<function>}
     */
    const ephemeralChangeHandler = (event) => {
      console.log(`[Server] ephemeralChangeHandler - Change event:`, {
        added: event.added.length,
        updated: event.updated.length,
        removed: event.removed.length,
        docName: name
      })
      
      // Only broadcast if there are actual changes
      if (event.added.length > 0 || event.updated.length > 0 || event.removed.length > 0) {
        try {
          console.log(`[Server] ephemeralChangeHandler - Broadcasting ephemeral update`)
          
          const encodedData = this.ephemeralStore.encodeAll()
          console.log(`[Server] ephemeralChangeHandler - Encoded data length:`, encodedData.length)
          
          const message: EphemeralMessage = {
            type: messageEphemeral,
            ephemeral: Array.from(encodedData),
            docId: name
          }
          const messageData = new TextEncoder().encode(JSON.stringify(message))
          console.log(`[Server] ephemeralChangeHandler - Broadcasting to ${this.connections.size} connections`)
          
          this.connections.forEach((_, c) => {
            send(this, c, messageData)
          })
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
    console.log(`[Server] messageListener - Received message of length:`, message.length)
    
    // Handle empty messages
    if (message.length === 0) {
      console.log(`[Server] messageListener - Received empty message, ignoring`)
      return
    }
    
    const messageStr = new TextDecoder().decode(message)
    console.log(`[Server] messageListener - Decoded message string length:`, messageStr.length)
    console.log(`[Server] messageListener - Message string sample:`, messageStr.substring(0, 200))
    
    // Handle empty string after decoding
    if (messageStr.length === 0) {
      console.log(`[Server] messageListener - Decoded empty string, ignoring`)
      return
    }
    
    const messageData: LoroWebSocketMessage = JSON.parse(messageStr)
    console.log(`[Server] messageListener - Parsed message data:`, {
      type: messageData.type,
      docId: messageData.docId,
      hasUpdate: !!(messageData as any).update,
      hasSnapshot: !!(messageData as any).snapshot,
      hasEphemeral: !!(messageData as any).ephemeral,
      ephemeralLength: (messageData as any).ephemeral?.length
    })
    
    switch (messageData.type) {
      case messageLoroUpdate:
        // Apply the Loro update to the document
        const updateData = messageData as LoroUpdateMessage;
        const updateBytes = new Uint8Array(updateData.update)
        doc.doc.import(updateBytes)
        
        // Send the update to all other connections
        doc.conns.forEach((_, c) => {
          if (c !== conn) {
            send(doc, c, message)
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
          type: messageSnapshot,
          snapshot: Array.from(snapshot),
          docId: doc.name
        }
        send(doc, conn, new TextEncoder().encode(JSON.stringify(response)))
        break
        
      case messageEphemeral:
        // Apply ephemeral update
        const ephemeralData = messageData as EphemeralMessage;
        console.log(`[Server] messageEphemeral - Processing ephemeral update:`, {
          ephemeralLength: ephemeralData.ephemeral?.length,
          ephemeralSample: ephemeralData.ephemeral?.slice(0, 10),
          docName: doc.name
        })
        
        try {
          const ephemeralBytes = new Uint8Array(ephemeralData.ephemeral)
          console.log(`[Server] messageEphemeral - Created Uint8Array of length:`, ephemeralBytes.length)
          
          doc.ephemeralStore.apply(ephemeralBytes)
          console.log(`[Server] messageEphemeral - Successfully applied ephemeral update`)
        } catch (ephemeralError) {
          console.error(`[Server] messageEphemeral - ERROR applying ephemeral update:`, {
            error: ephemeralError.message,
            stack: ephemeralError.stack,
            ephemeralLength: ephemeralData.ephemeral?.length,
            ephemeralSample: ephemeralData.ephemeral?.slice(0, 10)
          })
        }
        break
        
      case messageQueryEphemeral:
        // Send current ephemeral state to requesting client
        console.log(`[Server] messageQueryEphemeral - Query for ephemeral state, docName:`, doc.name)
        
        try {
          const ephemeralUpdate = doc.ephemeralStore.encodeAll()
          console.log(`[Server] messageQueryEphemeral - Encoded ephemeral update length:`, ephemeralUpdate.length)
          
          const ephemeralResponse: EphemeralMessage = {
            type: messageEphemeral,
            ephemeral: Array.from(ephemeralUpdate),
            docId: doc.name
          }
          console.log(`[Server] messageQueryEphemeral - Sending ephemeral response:`, {
            type: ephemeralResponse.type,
            ephemeralLength: ephemeralResponse.ephemeral.length,
            ephemeralSample: ephemeralResponse.ephemeral.slice(0, 10)
          })
          
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
  conn.on('message', /** @param {ArrayBuffer} message */ message => messageListener(conn, doc, new Uint8Array(message)))

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
