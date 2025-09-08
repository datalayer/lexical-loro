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
  private name: string | null = null;
  public conns = new Map(); // Make this public so onClose can access it

  constructor(name: string) {
    this.name = name
  }

  addConnection(conn: any) {
    this.conns.set(conn, new Set())
  }

  removeConnection(conn: any) {
    this.conns.delete(conn)
  }

  // Relay message to all other connections
  relayMessage(senderConn: any, message: any) {
    this.conns.forEach((_, conn) => {
      if (conn !== senderConn) {
        _send(this, conn, message)
      }
    })
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
  // Simply relay the message to all other connected clients
  doc.relayMessage(conn, message)
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

console.log('WebSocket server running on port', PORT)
