import {LoroDoc, EphemeralStore} from 'loro-crdt'
import * as map from 'lib0/map'
import * as eventloop from 'lib0/eventloop'
import {
  messageEphemeral,
  messageQueryEphemeral,
  messageQuerySnapshot,
  messageUpdate,
  EphemeralMessage,
  LoroWebSocketMessage,
  QuerySnapshotMessage,
} from '../../provider/websocket'
import { callbackHandler, isCallbackSet } from './callback'
import { initializeLoroDocWithLexicalContent } from '../../utils/InitialContent'

const pingTimeout = 30000

const CALLBACK_DEBOUNCE_WAIT = parseInt(process.env.CALLBACK_DEBOUNCE_WAIT || '2000')
const CALLBACK_DEBOUNCE_MAXWAIT = parseInt(process.env.CALLBACK_DEBOUNCE_MAXWAIT || '10000')

const debouncer = eventloop.createDebouncer(CALLBACK_DEBOUNCE_WAIT, CALLBACK_DEBOUNCE_MAXWAIT)

const wsReadyStateConnecting = 0
const wsReadyStateOpen = 1
const wsReadyStateClosing = 2
const wsReadyStateClosed = 3

const persistenceDir = process.env.YPERSISTENCE

/**
 * 
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
 * 
 */
export const setPersistence = persistence_ => {
  persistence = persistence_
}

/**
 * 
*/
export const getPersistence = () => persistence

/**
 * 
 */
export const docs = new Map<string, WSSharedDoc>()

/**
 * @type {(ydoc: Y.Doc) => Promise<void>}
 */
let contentInitializor = _ydoc => Promise.resolve()

/**
 * This function is called once every time a Loro document is created. You can
 * use it to pull data from an external source or initialize content.
 */
export const setContentInitializor = (f) => {
  contentInitializor = f
}

/**
 * Gets a Doc by name, whether in memory or on disk
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
 * 
 */
const sendMessage = (doc: WSSharedDoc, conn, message: LoroWebSocketMessage) => {
  if (conn.readyState === wsReadyStateClosing || conn.readyState === wsReadyStateClosed) {
    closeConn(doc, conn)
  }
  try {
//    console.log(`Sending message to ${conn.id || 'unknown'}`)
    conn.send(JSON.stringify(message), {}, err => { err != null && closeConn(doc, conn) })
  } catch (e) {
    console.error(e);
    closeConn(doc, conn);
  }
}

/**
 * 
 */
const sendMessageBinary = (doc: WSSharedDoc, conn, message: Uint8Array) => {
  if (conn.readyState === wsReadyStateClosing || conn.readyState === wsReadyStateClosed) {
    closeConn(doc, conn)
  }
  try {
//    console.log(`Sending message to ${conn.id || 'unknown'}`)
    conn.send(message, {}, err => { err != null && closeConn(doc, conn) })
  } catch (e) {
    console.error(e);
    closeConn(doc, conn);
  }
}

/**
 * 
 */
const messageListener = (conn, doc: WSSharedDoc, message: ArrayBuffer | string | Uint8Array) => {

  try {

    let messageData: LoroWebSocketMessage | null = null
    let messageStr: string = ''
    
    if (typeof message === 'string') {
      messageStr = message
    }
    else if (message instanceof ArrayBuffer) {
      try {
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
            sendMessageBinary(doc, c, new Uint8Array(message))
          }
        })
        return
      }
    } else if (message instanceof Uint8Array) {
      try {
        const decoder = new TextDecoder()
        messageStr = decoder.decode(message);
      } catch (decodeError) {
        console.error(`[Server] messageListener - Failed to decode Uint8Array as string, treating as binary Loro update`)
        // If decoding fails, treat as raw binary Loro update
        doc.doc.import(message);
        // Broadcast the update to other connections
        doc.conns.forEach((_, c) => {
          if (c !== conn) {
            sendMessageBinary(doc, c, message)
          }
        })
        return
      }
    } else {
      console.error(`[Server] messageListener - Unknown message type:`, typeof message)
      return
    }
    
    if (!messageStr || messageStr.length === 0) {
      return
    }
    
    try {
      messageData = JSON.parse(messageStr) as LoroWebSocketMessage
    } catch (parseError) {
      console.error(`[Server] messageListener - JSON parse error:`, parseError.message)
      console.error(`[Server] messageListener - Raw message:`, messageStr.substring(0, 500))
      return
    }

    console.log(`[Server] Received message type: ${messageData.type} for doc: ${doc.name}`)
    
    switch (messageData.type) {

      case messageQuerySnapshot:
        // Client is requesting a snapshot - send current document state
        const requestId = Math.random().toString(36).substr(2, 9);
        console.log(`[Server] Client requesting snapshot for doc: ${doc.name} (Request ID: ${requestId})`)
        const snapshot = doc.doc.export({ mode: 'snapshot' })
        console.log(`[Server] Sending snapshot response: ${snapshot.length} bytes (Request ID: ${requestId})`)
        // Send binary snapshot data directly instead of wrapped message
        conn.send(snapshot)
        break


        
      case messageEphemeral:
        try {
          const ephemeralBytes = new Uint8Array(messageData.ephemeral)
          // Mark this connection as the sender to avoid echo
          doc.lastEphemeralSender = conn
          doc.ephemeralStore.apply(ephemeralBytes)
        } catch (ephemeralError) {
          console.error('messageEphemeral - ERROR applying ephemeral update')
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
          sendMessage(doc, conn, ephemeralResponse)
        } catch (error) {
            console.error('[Server] messageQueryEphemeral - ERROR encoding/sending ephemeral state:')
        }
        break

      case messageUpdate:
        // Apply the Loro update to the document.
        const updateBytes = new Uint8Array(messageData.update)
        doc.doc.import(updateBytes)
        // Create properly formatted message for broadcasting
        // Send the update to all other connections
        let broadcastCount = 0
        doc.conns.forEach((_, c) => {
          if (c !== conn) {
            console.log(`Broadcasting Update to connection: ${c.id}`)
            sendMessage(doc, c, messageData)
            broadcastCount++
          }
        })
        // Trigger callback if configured
        if (isCallbackSet) {
          debouncer(() => callbackHandler(doc))
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
  conn.on('message', message => messageListener(conn, doc, message))

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
    console.log(`[Server] Sending initial snapshot to new client: ${snapshot.length} bytes`)
    // Send binary snapshot data directly instead of wrapped message
    conn.send(snapshot)
    
    // Send current ephemeral state if any
    const ephemeralUpdate = doc.ephemeralStore.encodeAll()
    if (ephemeralUpdate.length > 0) {
      const ephemeralMessage: EphemeralMessage = {
        type: 'ephemeral',
        ephemeral: Array.from(ephemeralUpdate),
        docId: doc.name
      }
      sendMessage(doc, conn, ephemeralMessage)
    }
  }
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
    
    // Initialize the document with default Lexical content
    console.log(`[Server] Initializing document '${name}' with default content`)
    initializeLoroDocWithLexicalContent(this.doc)
    
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
          // Broadcast to all connections EXCEPT the one that sent the last ephemeral update
          this.conns.forEach((_, conn) => {
            if (conn !== this.lastEphemeralSender) {
              sendMessage(this, conn, message)
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
