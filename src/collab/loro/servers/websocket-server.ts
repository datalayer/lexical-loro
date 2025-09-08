import { LoroDoc } from 'loro-crdt';

import WebSocket from 'ws';

import * as http from 'http'

// Message types for Loro WebSocket protocol
const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

const wsReadyStateConnecting = 0
const wsReadyStateOpen = 1

export const DOCS = new Map()

/**
 * Encode a message for the Loro WebSocket protocol
 */
const encodeMessage = (type: number, data?: Uint8Array): Uint8Array => {
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
const decodeMessage = (buf: Uint8Array): { type: number; data: Uint8Array | null } | null => {
  if (buf.length === 0) return null
  const type = buf[0]
  const data = buf.length > 1 ? buf.slice(1) : null
  return { type, data }
}

const _send = (doc: WSSharedDoc, conn: any, m: Uint8Array) => {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    onClose(doc, conn)
  }
  try {
    conn.send(m, (err: any) => { err != null && onClose(doc, conn) })
  } catch (e) {
    onClose(doc, conn)
  }
}

class WSSharedDoc {
  private name: string | null = null;
  public conns = new Map(); // Make this public so onClose can access it
  private doc: LoroDoc;
  private awareness = new Map(); // Simple awareness state storage

  constructor(name: string) {
    this.name = name
    this.doc = new LoroDoc()
    
    // Listen to document updates
    this.doc.subscribe((event) => {
      if (event.by === 'local') {
        // Broadcast local changes to all connected clients
        const update = this.doc.exportFrom() // Use exportFrom() without parameters for full state
        const message = encodeMessage(MESSAGE_SYNC, update)
        this.conns.forEach((_, conn) => _send(this, conn, message))
      }
    })
  }

  getDoc(): LoroDoc {
    return this.doc
  }

  addConnection(conn: any) {
    this.conns.set(conn, new Set())
  }

  removeConnection(conn: any) {
    this.conns.delete(conn)
  }

  updateAwareness(clientID: string, state: any) {
    if (state === null) {
      this.awareness.delete(clientID)
    } else {
      this.awareness.set(clientID, state)
    }
    
    // Broadcast awareness update to all clients
    const awarenessData = JSON.stringify(Object.fromEntries(this.awareness))
    const message = encodeMessage(MESSAGE_AWARENESS, new TextEncoder().encode(awarenessData))
    this.conns.forEach((_, conn) => _send(this, conn, message))
  }
}

export const getDoc = (docname: string): WSSharedDoc => {
  let doc = DOCS.get(docname)
  if (!doc) {
    doc = new WSSharedDoc(docname)
    DOCS.set(docname, doc)
  }
  return doc
}

const onWsMessage = (conn: any, doc: WSSharedDoc, message: Uint8Array) => {
  const decoded = decodeMessage(message)
  if (!decoded) return

  switch (decoded.type) {
    case MESSAGE_SYNC:
      if (decoded.data) {
        // Apply the update to the document
        doc.getDoc().import(decoded.data)
      }
      // Send current state back to the client
      const currentState = doc.getDoc().exportFrom()
      if (currentState.length > 0) {
        const response = encodeMessage(MESSAGE_SYNC, currentState)
        _send(doc, conn, response)
      }
      break
      
    case MESSAGE_AWARENESS:
      if (decoded.data) {
        try {
          const awarenessData = JSON.parse(new TextDecoder().decode(decoded.data))
          for (const [clientID, state] of Object.entries(awarenessData)) {
            doc.updateAwareness(clientID, state)
          }
        } catch (e) {
          console.error('Failed to parse awareness data:', e)
        }
      }
      break
      
    default:
      console.error('Unknown message type:', decoded.type)
  }
}

const onClose = (doc: WSSharedDoc, conn: any) => {
  if (doc.conns.has(conn)) {
    doc.removeConnection(conn)
  }
  conn.close()
}

const setupWSConnection = (conn: any, req: any, { docName = req.url.slice(1).split('?')[0], gc = true } = {}) => {
  conn.binaryType = 'arraybuffer'
  const doc = getDoc(docName)
  doc.addConnection(conn)
  
  conn.on('message', (message: any) => onWsMessage(conn, doc, new Uint8Array(message)))
  conn.on('close', () => onClose(doc, conn))
  
  // Send initial sync message with current document state
  const currentState = doc.getDoc().exportFrom()
  if (currentState.length > 0) {
    const syncMessage = encodeMessage(MESSAGE_SYNC, currentState)
    _send(doc, conn, syncMessage)
  }
}

// Main

const PORT = process.env.PORT || 1234
const wss = new (WebSocket as any).Server({ noServer: true })

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('okay')
})

wss.on('connection', setupWSConnection)

server.on('upgrade', (request, socket, head) => {
  const handleAuth = ws => {
    wss.emit('connection', ws, request)
  }
  wss.handleUpgrade(request, socket, head, handleAuth)
})

server.listen(PORT)

console.log('WebSocket server running on port', PORT)
