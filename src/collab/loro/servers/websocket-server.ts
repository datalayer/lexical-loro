import { LoroDoc } from 'loro-crdt';

import WebSocket from 'ws';

import * as http from 'http'

const wsReadyStateConnecting = 0
const wsReadyStateOpen = 1

export const DOCS = new Map()

const _send = (doc: WSSharedDoc, conn: any, message: any) => {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    onClose(doc, conn)
  }
  try {
    conn.send(message, (err: any) => { err != null && onClose(doc, conn) })
  } catch (e) {
    onClose(doc, conn)
  }
}

class WSSharedDoc {
  private name: string;
  public conns = new Map(); // Make this public so onClose can access it
  private doc: LoroDoc;

  constructor(name: string) {
    this.name = name
    this.doc = new LoroDoc()
    console.log(`Created new LoroDoc for document: ${name}`)
  }

  getDoc(): LoroDoc {
    return this.doc
  }

  addConnection(conn: any) {
    this.conns.set(conn, new Set())
    console.log(`Connection added to document ${this.name}. Total connections: ${this.conns.size}`)
  }

  removeConnection(conn: any) {
    this.conns.delete(conn)
    console.log(`Connection removed from document ${this.name}. Total connections: ${this.conns.size}`)
  }

  // Apply update to the document and broadcast to other connections
  applyAndBroadcastUpdate(senderConn: any, updateData: any) {
    try {
      // Validate data before importing
      if (!updateData || updateData.length === 0) {
        console.warn(`Received empty update for document ${this.name}, skipping`)
        return
      }
      
      // Ensure data is a valid Uint8Array
      if (!(updateData instanceof Uint8Array)) {
        updateData = new Uint8Array(updateData)
      }
      
      // Apply the update to the server's copy of the document
      console.log('--- before', this.doc);
      this.doc.import(updateData)
      console.log(`Successfully applied update to document ${this.name}, broadcasting to ${this.conns.size - 1} other connections`)
      console.log('--- after', this.doc);
      
      // Broadcast to all other connections
      this.conns.forEach((_, conn) => {
        if (conn !== senderConn) {
          _send(this, conn, updateData)
        }
      })
    } catch (e) {
      console.error(`Failed to apply update to document ${this.name}:`, e)
      console.error('Update data length:', updateData?.length || 0)
      // Don't broadcast invalid updates
    }
  }

  // Send current document state to a specific connection
  sendCurrentState(conn: any) {
    try {
      const currentState = this.doc.exportFrom()
      if (currentState.length > 0) {
        _send(this, conn, currentState)
        console.log(`Sent current state to new connection for document ${this.name} (${currentState.length} bytes)`)
      } else {
        console.log(`No state to send for document ${this.name} (empty document)`)
      }
    } catch (e) {
      console.error(`Failed to send current state for document ${this.name}:`, e)
    }
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

const onWsMessage = (conn: any, doc: WSSharedDoc, message: any) => {
  // Apply the update to the server document and broadcast to other clients
  doc.applyAndBroadcastUpdate(conn, message)
}

const onClose = (doc: WSSharedDoc, conn: any) => {
  if (doc.conns.has(conn)) {
    doc.removeConnection(conn)
  }
  conn.close()
}

const setupWSConnection = (conn: any, req: any, { docName = req.url.slice(1).split('?')[0], gc = true } = {}) => {
  conn.binaryType = 'arraybuffer'
  
  // Extract document ID from URL (e.g., ws://localhost:1235/playground/0/main -> playground/0/main)
  const documentId = docName || 'default'
  console.log(`Setting up WebSocket connection for document: ${documentId}`)
  
  const doc = getDoc(documentId)
  doc.addConnection(conn)
  
  // Send current document state to the new connection
  doc.sendCurrentState(conn)
  
  conn.on('message', (message: any) => onWsMessage(conn, doc, message))
  conn.on('close', () => onClose(doc, conn))
}

// Main

const PORT = process.env.PORT || 1235
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

console.log('Loro WebSocket server running on port', PORT)
console.log('Document format: ws://localhost:1235/<document-id>')
console.log('Example: ws://localhost:1235/playground/0/main')
