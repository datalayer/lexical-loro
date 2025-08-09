/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

/* eslint-disable no-console */

const {WebSocketServer} = require('ws');
const {LoroDoc} = require('loro-crdt');

const PORT = 1234;

// Map to store Loro documents by room/document ID
const documentMap = new Map();

// Map to store client connections by room ID
const roomClients = new Map();

// Map to store awareness states by room ID
const roomAwareness = new Map();

// Helper function to get or create a Loro document for a room
function getOrCreateDocument(docId) {
  if (!documentMap.has(docId)) {
    const doc = new LoroDoc();
    documentMap.set(docId, doc);
    // eslint-disable-next-line no-console
    console.log(`Created new Loro document for room: ${docId}`);
  }
  return documentMap.get(docId);
}

// Helper function to get or create client set for a room
function getOrCreateClients(docId) {
  if (!roomClients.has(docId)) {
    roomClients.set(docId, new Set());
  }
  return roomClients.get(docId);
}

// Helper function to get or create awareness map for a room
function getOrCreateAwareness(docId) {
  if (!roomAwareness.has(docId)) {
    roomAwareness.set(docId, new Map());
  }
  return roomAwareness.get(docId);
}

// Broadcast message to all clients in a room except the sender
function broadcastToRoom(docId, message, excludeClient = null) {
  const clients = roomClients.get(docId);
  if (!clients) {
    return;
  }

  const messageStr = JSON.stringify(message);
  clients.forEach(client => {
    if (client !== excludeClient && client.readyState === client.OPEN) {
      try {
        client.send(messageStr);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error sending message to client:', error);
        // Remove dead client
        clients.delete(client);
      }
    }
  });
}

// Create WebSocket server
const wss = new WebSocketServer({
  perMessageDeflate: false, // Disable compression for simplicity
  port: PORT,
});

// eslint-disable-next-line no-console
console.log(`Loro WebSocket server started on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  // eslint-disable-next-line no-console
  console.log('New client connected');

  let clientDocId = null;
  let clientUserId = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      const {data: messageData, docId, type, userId} = message;

      switch (type) {
        case 'join': {
          // eslint-disable-next-line no-console
          console.log(`Client ${userId} joining room ${docId}`);

          clientDocId = docId;
          clientUserId = userId;

          // Add client to room
          const clients = getOrCreateClients(docId);
          clients.add(ws);

          // Get or create document
          const doc = getOrCreateDocument(docId);

          // Send current document state to the new client
          const currentState = doc.exportFrom();
          ws.send(JSON.stringify({
            data: Array.from(currentState),
            docId,
            type: 'init',
          }));

          // Send current awareness state
          const awareness = getOrCreateAwareness(docId);
          if (awareness.size > 0) {
            ws.send(JSON.stringify({
              data: Object.fromEntries(awareness),
              docId,
              type: 'awareness-init',
            }));
          }

          // eslint-disable-next-line no-console
          console.log(`Room ${docId} now has ${clients.size} clients`);
          break;
        }

        case 'update': {
          if (!clientDocId) {
            // eslint-disable-next-line no-console
            console.warn('Received update from client not in any room');
            return;
          }

          // eslint-disable-next-line no-console
          console.log(`Received update for room ${clientDocId} from user ${clientUserId}`);

          // Get the document and apply the update
          const doc = getOrCreateDocument(clientDocId);

          try {
            // Apply the update to the server's document
            const updateBytes = new Uint8Array(messageData);
            doc.import(updateBytes);

            // eslint-disable-next-line no-console
            console.log(`Applied update to document ${clientDocId}, new version:`, doc.version());

            // Broadcast the update to all other clients in the room
            broadcastToRoom(clientDocId, {
              data: messageData,
              docId: clientDocId,
              type: 'update',
              userId: clientUserId,
            }, ws);

          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Error applying Loro update:', error);
            // Send error back to client
            ws.send(JSON.stringify({
              docId: clientDocId,
              message: 'Failed to apply update',
              type: 'error',
            }));
          }
          break;
        }

        case 'awareness': {
          if (!clientDocId) {
            // eslint-disable-next-line no-console
            console.warn('Received awareness from client not in any room');
            return;
          }

          // eslint-disable-next-line no-console
          console.log(`Received awareness update for room ${clientDocId} from user ${clientUserId}`);

          // Update awareness state
          const awareness = getOrCreateAwareness(clientDocId);
          if (messageData && messageData.state) {
            awareness.set(clientUserId, messageData.state);
          } else {
            awareness.delete(clientUserId);
          }

          // Broadcast awareness update to all other clients in the room
          broadcastToRoom(clientDocId, {
            data: messageData,
            docId: clientDocId,
            type: 'awareness',
            userId: clientUserId,
          }, ws);

          break;
        }

        case 'ping': {
          // Respond to ping with pong
          ws.send(JSON.stringify({
            timestamp: Date.now(),
            type: 'pong',
          }));
          break;
        }

        default: {
          // eslint-disable-next-line no-console
          console.warn('Unknown message type:', type);
          break;
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        message: 'Invalid message format',
        type: 'error',
      }));
    }
  });

  ws.on('close', () => {
    // eslint-disable-next-line no-console
    console.log(`Client disconnected${clientUserId ? ` (user ${clientUserId})` : ''}`);

    if (clientDocId) {
      // Remove client from room
      const clients = roomClients.get(clientDocId);
      if (clients) {
        clients.delete(ws);
        // eslint-disable-next-line no-console
        console.log(`Room ${clientDocId} now has ${clients.size} clients`);

        // If room is empty, optionally clean up
        if (clients.size === 0) {
          // eslint-disable-next-line no-console
          console.log(`Room ${clientDocId} is now empty`);
          // Optionally remove empty rooms after a timeout
          // setTimeout(() => {
          //   if (roomClients.get(clientDocId)?.size === 0) {
          //     documentMap.delete(clientDocId);
          //     roomClients.delete(clientDocId);
          //     roomAwareness.delete(clientDocId);
          //     console.log(`Cleaned up empty room ${clientDocId}`);
          //   }
          // }, 30000); // 30 seconds
        }
      }

      // Remove from awareness and notify other clients
      if (clientUserId) {
        const awareness = roomAwareness.get(clientDocId);
        if (awareness) {
          awareness.delete(clientUserId);

          // Notify other clients that this user left
          broadcastToRoom(clientDocId, {
            data: null, // null indicates user left
            docId: clientDocId,
            type: 'awareness',
            userId: clientUserId,
          });
        }
      }
    }
  });

  ws.on('error', (error) => {
    // eslint-disable-next-line no-console
    console.error('WebSocket error:', error);
  });

  // Send initial ping to client
  ws.send(JSON.stringify({
    message: 'Connected to Loro collaboration server',
    timestamp: Date.now(),
    type: 'welcome',
  }));
});

// Graceful shutdown
process.on('SIGINT', () => {
  // eslint-disable-next-line no-console
  console.log('\nShutting down Loro WebSocket server...');
  wss.close(() => {
    // eslint-disable-next-line no-console
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  // eslint-disable-next-line no-console
  console.log('\nShutting down Loro WebSocket server...');
  wss.close(() => {
    // eslint-disable-next-line no-console
    console.log('Server closed');
    process.exit(0);
  });
});
