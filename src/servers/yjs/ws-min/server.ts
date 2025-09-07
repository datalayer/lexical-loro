import * as Y from 'yjs';

import WebSocket from 'ws'
const http = require('http')

const encoding = require('lib0/dist/encoding.cjs')
const decoding = require('lib0/dist/decoding.cjs')
const mutex = require('lib0/dist/mutex.cjs')
const map = require('lib0/dist/map.cjs')

const syncProtocol = require('y-protocols/dist/sync.cjs')

const wsReadyStateConnecting = 0
const wsReadyStateOpen = 1

const messageSync = 0

export const DOCS = new Map()

const _send = (doc, conn, m) => {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    onClose(doc, conn)
  }
  try {
    conn.send(m, err => { err != null && onClose(doc, conn) })
  } catch (e) {
    onClose(doc, conn)
  }
}

class WSSharedDoc extends Y.Doc {
  private name = null;
  private mux = null;
  private conns = new Map();

  updateHandler(update, origin, doc) {
    console.log('Update received:', update);
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageSync)
    syncProtocol.writeUpdate(encoder, update)
    const message = encoding.toUint8Array(encoder)
    doc.conns.forEach((_, conn) => _send(doc, conn, message))
  }

  constructor (name) {
    super({ gc: false })
    this.name = name
    this.mux = mutex.createMutex();
    this.on('update', this.updateHandler);
  }

}

export const getDoc = (docname) => map.setIfUndefined(DOCS, docname, () => {
  const doc = new WSSharedDoc(docname);
  DOCS.set(docname, doc);
  return doc;
})

const onWsMessage = (conn, doc, message) => {
  console.log('Received message from client:', message);
  const encoder = encoding.createEncoder();
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);
  switch (messageType) {
    case messageSync:
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, doc, null);
      if (encoding.length(encoder) > 1) {
        _send(doc, conn, encoding.toUint8Array(encoder))
      }
      break;
  }
}

const onClose = (doc, conn) => {
  if (doc.conns.has(conn)) {
    doc.conns.delete(conn)
  }
  conn.close()
}

const setupWSConnection = (conn, req, { docName = req.url.slice(1).split('?')[0], gc = true } = {}) => {
  conn.binaryType = 'arraybuffer'
  const doc = getDoc(docName)
  doc.conns.set(conn, new Set())
  conn.on('message', message => onWsMessage(conn, doc, new Uint8Array(message)))
  conn.on('close', () => onClose(doc, conn))
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep1(encoder, doc)
  _send(doc, conn, encoding.toUint8Array(encoder))
}

// Main

const PORT = process.env.PORT || 1234
const wss = new WebSocket.Server({ noServer: true })

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
