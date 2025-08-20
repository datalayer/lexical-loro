import WebSocket, { WebSocketServer } from 'ws';

interface Client {
  ws: WebSocket;
  id: string;
}

interface LoroMessage {
  type: string;
  update?: number[];
  updateHex?: string;
  clientId?: string;
  message?: string;
  snapshot?: number[];
  snapshotHex?: string;
  requesterId?: string;
  docId?: string;
}

class LoroWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private port: number;
  private documents: Map<string, Uint8Array> = new Map(); // Store snapshots per docId

  constructor(port: number = 8080) {
    this.port = port;
    this.wss = new WebSocketServer({ port: this.port });
    this.setupServer();
  }

  private setupServer(): void {
    console.log(`🚀 Loro WebSocket server starting on port ${this.port}`);

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      const client: Client = { ws, id: clientId };
      
      this.clients.set(clientId, client);
      console.log(`📱 Client ${clientId} connected. Total clients: ${this.clients.size}`);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        clientId: clientId,
        message: 'Connected to Loro CRDT server'
      }));

      // Send current document snapshot to the new client if available
      // For now, send snapshots for both known document types
      const sharedTextSnapshot = this.documents.get('shared-text');
      const lexicalSnapshot = this.documents.get('lexical-shared-doc');
      
      if (sharedTextSnapshot && sharedTextSnapshot.length > 0) {
        const hex = Array.from(sharedTextSnapshot).map((b: number) => b.toString(16).padStart(2, '0')).join('');
        ws.send(JSON.stringify({
          type: 'initial-snapshot',
          snapshotHex: hex,
          docId: 'shared-text'
        }));
        console.log(`📄 Sent shared-text snapshot to client ${clientId}`);
      }
      
      if (lexicalSnapshot && lexicalSnapshot.length > 0) {
        const hex = Array.from(lexicalSnapshot).map((b: number) => b.toString(16).padStart(2, '0')).join('');
        ws.send(JSON.stringify({
          type: 'initial-snapshot',
          snapshotHex: hex,
          docId: 'lexical-shared-doc'
        }));
        console.log(`📄 Sent lexical snapshot to client ${clientId}`);
      }

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'loro-update') {
            // Normalize to hex for broadcast
            const docId = message.docId || 'shared-text';
            let updateHex = message.updateHex;
            if (!updateHex && message.update) {
              const arr = message.update as number[];
              updateHex = arr.map((b: number) => b.toString(16).padStart(2, '0')).join('');
            }
            if (updateHex) {
              this.broadcastToOthers(clientId, { type: 'loro-update', docId, updateHex });
            }
            console.log(`🔄 Broadcasting Loro update from client ${clientId} to ${this.clients.size - 1} other clients`);
          } else if (message.type === 'snapshot') {
            // Store the current document snapshot for new clients
            const docId = message.docId || 'shared-text';
            if (message.snapshotHex) {
              const hex = message.snapshotHex as string;
              const len = hex.length / 2;
              const buf = new Uint8Array(len);
              for (let i = 0; i < len; i++) buf[i] = parseInt(hex.substr(i * 2, 2), 16);
              this.documents.set(docId, buf);
            } else if (message.snapshot) {
              this.documents.set(docId, new Uint8Array(message.snapshot));
            }
            console.log(`📄 Updated snapshot for document ${docId} from client ${clientId}`);
          } else if (message.type === 'request-snapshot') {
            // Client is requesting the current snapshot for a specific document
            const docId = message.docId || 'shared-text';
            const document = this.documents.get(docId);
            
            if (document && document.length > 0) {
              const hex = Array.from(document as Uint8Array).map((b: number) => b.toString(16).padStart(2, '0')).join('');
              ws.send(JSON.stringify({ type: 'initial-snapshot', snapshotHex: hex, docId }));
              console.log(`📄 Sent requested snapshot for ${docId} to client ${clientId}`);
            } else {
              // No snapshot available, ask other clients to provide one
              this.broadcastToOthers(clientId, {
                type: 'snapshot-request',
                requesterId: clientId,
                docId: docId
              });
              console.log(`📞 Requesting snapshot for ${docId} from other clients for ${clientId}`);
            }
          }
        } catch (error) {
          console.error('❌ Error processing message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`📴 Client ${clientId} disconnected. Total clients: ${this.clients.size}`);
      });

      ws.on('error', (error: Error) => {
        console.error(`❌ WebSocket error for client ${clientId}:`, error);
        this.clients.delete(clientId);
      });
    });

    this.wss.on('error', (error: Error) => {
      console.error('❌ WebSocket server error:', error);
    });

    console.log(`✅ Loro WebSocket server is running on ws://localhost:${this.port}`);
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private broadcastToOthers(senderId: string, message: LoroMessage): void {
    this.clients.forEach((client, clientId) => {
      if (clientId !== senderId && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error(`❌ Error sending message to client ${clientId}:`, error);
          // Remove client if sending fails
          this.clients.delete(clientId);
        }
      }
    });
  }

  public getStats() {
    return {
      connectedClients: this.clients.size,
      port: this.port
    };
  }

  public close(): void {
    console.log('🛑 Shutting down Loro WebSocket server...');
    this.wss.close();
  }
}

// Start the server
const server = new LoroWebSocketServer(8080);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  server.close();
  process.exit(0);
});

// Log stats every 30 seconds
setInterval(() => {
  const stats = server.getStats();
  console.log(`📊 Server stats: ${stats.connectedClients} connected clients`);
}, 30000);

export default LoroWebSocketServer;
