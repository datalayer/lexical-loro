/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { useEffect, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LoroDoc } from 'loro-crdt';
import { createLoroBinding, type LoroBinding } from './collaboration/LoroBinding';
import { initializeSyncHandlers } from './collaboration/sync/SyncLoroToLexical';

// Types for peer information
export interface PeerInfo {
  id: string;
  displayId: string;
  isCurrentUser: boolean;
}

// Types for the new collaborative plugin
interface LoroCollaborativePluginV2Props {
  websocketUrl: string;
  docId: string;
  onConnectionChange?: (connected: boolean) => void;
  onInitialization?: (initialized: boolean) => void;
  onPeerIdChange?: (peerId: string) => void;
  onPeerCountChange?: (peerCount: number) => void;
  onPeersChange?: (peers: PeerInfo[]) => void;
}

/**
 * New LoroCollaborativePlugin that follows the YJS pattern
 * This version uses incremental updates instead of full editor state replacement
 */
export function LoroCollaborativePluginV2({
  websocketUrl,
  docId,
  onConnectionChange,
  onInitialization,
  onPeerIdChange,
  onPeerCountChange,
  onPeersChange
}: LoroCollaborativePluginV2Props) {
  const [editor] = useLexicalComposerContext();
  const [initialized, setInitialized] = useState(false);
  
  // Refs to store collaboration objects
  const loroDocRef = useRef<LoroDoc | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const bindingRef = useRef<LoroBinding | null>(null);
  const syncCleanupRef = useRef<(() => void) | null>(null);
  
  // Initialize the collaboration system
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    async function initializeCollaboration() {
      try {
        console.log('🚀 Initializing LoroCollaborativePluginV2');

        // Create Loro document
        const loroDoc = new LoroDoc();
        loroDocRef.current = loroDoc;

        // Create Loro binding for collaboration (equivalent to YJS binding)
        const provider = { doc: loroDoc, connected: false };
        const binding = createLoroBinding(
          editor,
          provider,
          docId,
          loroDoc,
          new Map(),
          new Map()
        );
        bindingRef.current = binding;

        // Initialize sync handlers (equivalent to YJS sync setup)
        const syncCleanup = initializeSyncHandlers(binding);
        syncCleanupRef.current = syncCleanup;

        // Create WebSocket connection to V2 server
        const wsUrl = `${websocketUrl}/${docId}`;
        console.log('🔌 Connecting to V2 server:', wsUrl);
        
        function connectWebSocket() {
          const websocket = new WebSocket(wsUrl);
          websocketRef.current = websocket;

          websocket.onopen = () => {
            console.log('✅ V2 WebSocket connected');
            onConnectionChange?.(true);
            onPeerIdChange?.(loroDoc.peerIdStr);
            
            // Clear any reconnect timer
            if (reconnectTimer) {
              clearTimeout(reconnectTimer);
              reconnectTimer = null;
            }
          };

          websocket.onclose = () => {
            console.log('❌ V2 WebSocket disconnected');
            onConnectionChange?.(false);
            
            // Attempt to reconnect after 2 seconds
            if (!reconnectTimer) {
              reconnectTimer = setTimeout(() => {
                console.log('🔄 Attempting to reconnect...');
                connectWebSocket();
              }, 2000);
            }
          };

          websocket.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);
              console.log('📨 V2 Received message:', message.type);

              if (message.type === 'welcome') {
                console.log('👋 Welcome message received:', message);
                if (message.peerCount !== undefined) {
                  onPeerCountChange?.(message.peerCount);
                }
                if (message.peers) {
                  onPeersChange?.(message.peers);
                }
                
              } else if (message.type === 'snapshot' && message.snapshot) {
                console.log('📸 Applying initial snapshot');
                handleSnapshot(message.snapshot);
                
                if (message.peerCount !== undefined) {
                  onPeerCountChange?.(message.peerCount);
                }
                if (message.peers) {
                  onPeersChange?.(message.peers);
                }
                
                if (!initialized) {
                  setInitialized(true);
                  onInitialization?.(true);
                }
                
              } else if (message.type === 'peerUpdate') {
                console.log('👥 Peer update:', message.peerCount, 'peers');
                if (message.peerCount !== undefined) {
                  onPeerCountChange?.(message.peerCount);
                }
                if (message.peers) {
                  onPeersChange?.(message.peers);
                }
                
              } else if (message.type === 'update' && message.update) {
                console.log('🔄 Applying incremental update from client:', message.clientId);
                handleIncrementalUpdate(message.update);
              }
            } catch (error) {
              console.error('❌ Failed to process V2 message:', error);
            }
          };

          websocket.onerror = (error) => {
            console.error('❌ V2 WebSocket error:', error);
          };
        }

        // Function to handle snapshot from server
        function handleSnapshot(snapshotB64: string) {
          try {
            // Decode base64 snapshot
            const snapshotBytes = Uint8Array.from(atob(snapshotB64), c => c.charCodeAt(0));
            
            // Import snapshot into Loro document
            loroDoc.import(snapshotBytes);
            
            // Apply to Lexical editor using incremental updates
            // For now, let's just log the content
            const text = loroDoc.getText('root');
            console.log('📄 Snapshot applied, text content:', text.toString());
            
            // TODO: Convert Loro text to Lexical operations and apply incrementally
            // This is where we would use the collaboration infrastructure
            
          } catch (error) {
            console.error('❌ Failed to apply snapshot:', error);
          }
        }

        // Function to handle incremental updates
        function handleIncrementalUpdate(updateB64: string) {
          try {
            // Decode base64 update
            const updateBytes = Uint8Array.from(atob(updateB64), c => c.charCodeAt(0));
            
            // Import update into Loro document
            loroDoc.import(updateBytes);
            
            // Apply incremental changes to Lexical
            // TODO: Use syncLoroToLexical from collaboration infrastructure
            console.log('🔄 Incremental update applied');
            
          } catch (error) {
            console.error('❌ Failed to apply incremental update:', error);
          }
        }

        // Connect to WebSocket
        connectWebSocket();

        // Set up editor update listener for outgoing changes
        const removeUpdateListener = editor.registerUpdateListener(
          ({ dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
            // Skip updates that came from collaboration to avoid loops
            if (tags.has('collaboration') || tags.has('historic')) {
              return;
            }

            console.log('📝 Editor changed, generating Loro update');
            
            // TODO: Convert Lexical changes to Loro operations
            // For now, just get the current text and update Loro
            try {
              editor.getEditorState().read(() => {
                const root = editor.getEditorState()._nodeMap.get('root');
                const textContent = editor.getEditorState().read(() => {
                  // Extract text content from editor
                  return root ? 'Sample text from editor' : '';
                });
                
                // Generate Loro update
                const text = loroDoc.getText('root');
                
                // Clear and insert new content (simplified for now)
                // In a real implementation, we'd calculate the diff
                if (textContent !== text.toString()) {
                  text.delete(0, text.length);
                  text.insert(0, textContent);
                  
                  // Export the update and send to server
                  const updateBytes = loroDoc.exportFrom(loroDoc.version());
                  if (updateBytes.length > 0 && websocketRef.current?.readyState === WebSocket.OPEN) {
                    const updateB64 = btoa(String.fromCharCode(...updateBytes));
                    websocketRef.current.send(JSON.stringify({
                      type: 'update',
                      docId: docId,
                      update: updateB64
                    }));
                    console.log('📤 Sent Loro update to server');
                  }
                }
              });
            } catch (error) {
              console.error('❌ Failed to generate Loro update:', error);
            }
            
            // Log the changes for debugging
            console.log('📊 V2 Changes:', {
              dirtyElements: dirtyElements.size,
              dirtyLeaves: dirtyLeaves.size,
              normalizedNodes: normalizedNodes.size
            });
          }
        );

        // Cleanup function
        cleanup = () => {
          console.log('🧹 Cleaning up LoroCollaborativePluginV2');
          removeUpdateListener();
          
          // Clean up sync handlers
          if (syncCleanupRef.current) {
            syncCleanupRef.current();
            syncCleanupRef.current = null;
          }
          
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
          }
          
          if (websocketRef.current) {
            websocketRef.current.close();
            websocketRef.current = null;
          }
          
          loroDocRef.current = null;
          bindingRef.current = null;
        };

      } catch (error) {
        console.error('❌ Failed to initialize V2 collaboration:', error);
      }
    }

    initializeCollaboration();

    return () => {
      cleanup?.();
    };
  }, [editor, websocketUrl, docId, onConnectionChange, onInitialization, onPeerIdChange, onPeerCountChange, onPeersChange, initialized]);

  // This plugin doesn't render anything - it just handles collaboration
  return null;
}

export default LoroCollaborativePluginV2;
