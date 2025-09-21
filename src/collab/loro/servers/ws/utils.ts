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
import { callbackIntegrator, isCallbackSet } from './callback'
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

// Helper function to log tree structure for debugging
const logTreeStructure = (doc: LoroDoc, context: string) => {
  try {
    console.log(`[Server] ${context} - Tree Structure Debug:`)
    
    // Try to get the tree container using getTree method
    try {
      const tree = doc.getTree('tree')
      if (tree) {
        const nodes = tree.nodes()
        console.log(`[Server] Total nodes in tree: ${nodes.length}`)
        
        // Helper function to recursively log tree structure
        const logTreeStructureRecursive = (node: any, prefix: string = '', isLast: boolean = true, depth: number = 0) => {
          const data = Object.fromEntries(node.data.entries())
          const treeId = node.id
          const elementType = data.elementType || 'no-type'
          
          const connector = depth === 0 ? '' : (isLast ? '└── ' : '├── ')
          const nodeInfo = `TreeID(${treeId.slice(0, 8)}...) [${elementType}]`
          
          console.log(`[Server] ${prefix}${connector}${nodeInfo}`)
          
          const children = node.children()
          if (children && children.length > 0) {
            children.forEach((child: any, index: number) => {
              const isLastChild = index === children.length - 1
              const childPrefix = prefix + (depth === 0 ? '' : (isLast ? '    ' : '│   '))
              logTreeStructureRecursive(child, childPrefix, isLastChild, depth + 1)
            })
          }
        }
        
        // Find and display all root nodes
        const rootNodes = nodes.filter((node: any) => {
          const parent = node.parent()
          const data = Object.fromEntries(node.data.entries())
          return !parent || data.isRoot
        })
        
        console.log(`[Server] Root nodes: ${rootNodes.length}`)
        console.log('')
        
        if (rootNodes.length === 0) {
          console.log('[Server] ⚠️  No root nodes found!')
        } else {
          rootNodes.forEach((root, index) => {
            const isLastRoot = index === rootNodes.length - 1
            logTreeStructureRecursive(root, '', isLastRoot, 0)
          })
        }
        
      } else {
        console.log(`[Server] No tree container found`)
      }
    } catch (treeError) {
      console.log(`[Server] Error accessing tree container:`, treeError.message)
    }
    
    // Try export with different modes for debugging
    try {
      const snapshot = doc.export({ mode: 'snapshot' })
      console.log(`[Server] Snapshot size: ${snapshot.length} bytes`)
      
      const update = doc.export({ mode: 'update' })  
      console.log(`[Server] Update size: ${update.length} bytes`)
    } catch (exportError) {
      console.log(`[Server] Error exporting:`, exportError.message)
    }
    
  } catch (error) {
    console.warn(`[Server] Error logging tree structure:`, error)
  }
}

/**
 * 
 */
let persistence = null
if (typeof persistenceDir === 'string') {
  console.log('Persistence directory configured: "' + persistenceDir + '" but Loro persistence not yet implemented')
  // TODO: Implement actual Loro document persistence
  // For now, disable persistence to keep documents in memory
  console.log('Disabling persistence - documents will be kept in memory only')
  persistence = null
  
  // Uncomment and implement when ready for actual persistence:
  // persistence = {
  //   provider: null, // Replace with Loro-compatible persistence provider
  //   bindState: async (docName, doc: WSSharedDoc) => {
  //     // TODO: Implement Loro document persistence loading
  //     console.warn(`Loading state for document: ${docName}`)
  //   },
  //   writeState: async (docName, doc: WSSharedDoc) => {
  //     // TODO: Implement Loro document state writing
  //     console.warn(`Saving state for document: ${docName}`)
  //   }
  // }
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
    console.warn(e);
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
    console.warn(e);
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
        console.warn(`[Server] messageListener - Failed to decode ArrayBuffer as string, treating as binary Loro update`)
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
        console.warn(`[Server] messageListener - Failed to decode Uint8Array as string, treating as binary Loro update`)
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
      console.warn(`[Server] messageListener - Unknown message type:`, typeof message)
      return
    }
    
    if (!messageStr || messageStr.length === 0) {
      return
    }
    
    try {
      messageData = JSON.parse(messageStr) as LoroWebSocketMessage
    } catch (parseError) {
      console.warn(`[Server] messageListener - JSON parse error:`, parseError.message)
      console.warn(`[Server] messageListener - Raw message:`, messageStr.substring(0, 500))
      return
    }

    console.log(`[Server] Received message type: ${messageData.type} for doc: ${doc.name}`)
    
    switch (messageData.type) {

      case messageQuerySnapshot:
        // Client is requesting a snapshot - send current document state
        const requestId = Math.random().toString(36).substr(2, 9);
        console.log(`[Server] Client requesting snapshot for doc: ${doc.name} (Request ID: ${requestId})`)
        
        // Log tree structure before creating snapshot
        // logTreeStructure(doc.doc, `Before creating snapshot (Request ID: ${requestId})`)
        
        try {
          const snapshot = doc.doc.export({ mode: 'snapshot' })
          console.log(`[Server] Sending snapshot response: ${snapshot.length} bytes (Request ID: ${requestId})`)
          
          // Verify the snapshot contains expected content
          const tree = doc.doc.getTree('tree')
          const nodes = tree.nodes()
          console.log(`[Server] Snapshot contains ${nodes.length} nodes from server document`)
          
          // Send binary snapshot data directly instead of wrapped message
          conn.send(snapshot)
        } catch (snapshotError) {
          console.error(`[Server] ERROR creating/sending snapshot:`, snapshotError.message)
          console.error(`[Server] Stack:`, snapshotError.stack)
        }
        break

      case messageEphemeral:
        try {
          const ephemeralBytes = new Uint8Array(messageData.ephemeral)
          // Mark this connection as the sender to avoid echo
          doc.lastEphemeralSender = conn
          doc.ephemeralStore.apply(ephemeralBytes)
        } catch (ephemeralError) {
          console.warn('messageEphemeral - ERROR applying ephemeral update')
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
            console.warn('[Server] messageQueryEphemeral - ERROR encoding/sending ephemeral state:')
        }
        break

      case messageUpdate:
        // Apply the Loro update to the document.
        const updateBytes = new Uint8Array(messageData.update)
        const i = doc.doc.import(updateBytes)
        // logTreeStructure(doc.doc, `After applying update from client ${conn.id || 'unknown'}`)
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
          debouncer(() => callbackIntegrator(doc))
        }
        break
        
    }
  } catch (err) {
    console.warn(err)
    // Note: LoroDoc doesn't have emit method, using console.warn instead
    console.warn('Message handling error:', err)
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
    if (doc.conns.size === 0) {
      if (persistence !== null) {
        // if persisted, we store state and cleanup document
        console.log(`[Server] Persisting document ${doc.name} before cleanup`)
        persistence.writeState(doc.name, doc).then(() => {
          // Cleanup WSSharedDoc resources (no destroy method needed for Loro)
          console.log(`[Server] Document ${doc.name} persisted and cleaned up`)
        })
        docs.delete(doc.name)
      } else {
        // No persistence configured - keep document in memory for reconnections
        console.log(`[Server] No persistence configured - keeping document ${doc.name} in memory for future connections`)
        // logTreeStructure(doc.doc, `Document ${doc.name} structure before keeping in memory`)
      }
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
  // put the following in a variables in a block so the interval integrators don't keep in in
  // scope
  {
    // Send initial snapshot to new client
    // Log tree structure before creating initial snapshot
    // logTreeStructure(doc.doc, `Before creating initial snapshot for new client ${conn.id}`)
    
    try {
      const snapshot = doc.doc.export({ mode: 'snapshot' })
      console.log(`[Server] Sending initial snapshot to new client: ${snapshot.length} bytes`)
      
      // Verify the snapshot contains expected content
      const tree = doc.doc.getTree('tree')
      const nodes = tree.nodes()
      console.log(`[Server] Initial snapshot contains ${nodes.length} nodes from server document`)
      
      // Send binary snapshot data directly instead of wrapped message
      conn.send(snapshot)
    } catch (snapshotError) {
      console.error(`[Server] ERROR creating/sending initial snapshot:`, snapshotError.message)
      console.error(`[Server] Stack:`, snapshotError.stack)
    }
    
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
    const ephemeralChangeIntegrator = (event) => {
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
          console.warn(`[Server] ephemeralChangeIntegrator - ERROR broadcasting:`, {
            error: broadcastError.message,
            stack: broadcastError.stack
          })
        }
      }
    }
    this.ephemeralStore.subscribe(ephemeralChangeIntegrator)
    // Note: LoroDoc doesn't have 'on' method like Y.Doc
    // Update handling will be done through message processing
  }
}
