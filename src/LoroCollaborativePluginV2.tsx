/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LoroDoc } from 'loro-crdt';
import { createLoroBinding, type LoroBinding, type LoroProvider } from './collaboration/LoroBinding';
import { syncLexicalUpdateToLoro } from './collaboration/sync/SyncLoroToLexical';

// Types for peer information
export interface PeerInfo {
  id: string;
  clientId: string;
  displayId: string;
  isCurrentUser: boolean;
  isYou?: boolean;
}

// Types for the new collaborative plugin
interface LoroCollaborativePluginV2Props {
  id: string;
  docId: string;
  websocketUrl?: string;
  onConnectionChange?: (connected: boolean) => void;
  onInitialization?: (doc: LoroDoc) => void;
  onPeerIdChange?: (peerId: string) => void;
  onPeerCountChange?: (count: number) => void;
  onPeersChange?: (peers: Array<{ id: string; clientId: string; isYou?: boolean }>) => void;
}

/**
 * Initialize sync event handlers (equivalent to YJS sync setup)
 * 
 * This sets up the bidirectional sync between Loro and Lexical,
 * following the YJS collaboration pattern
 */
function initializeLoroSyncHandlers(binding: LoroBinding): () => void {
  const { editor } = binding;
  
  console.log('🔄 Initializing Loro ↔ Lexical sync handlers');
  
  // Set up Lexical editor change listener (equivalent to YJS editor.registerUpdateListener)
  const removeEditorListener = editor.registerUpdateListener(
    ({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
      // Convert Lexical changes to Loro operations
      syncLexicalUpdateToLoro(
        binding, 
        binding as unknown as LoroProvider, // TODO: Replace with actual provider
        prevEditorState, 
        editorState, 
        dirtyElements, 
        dirtyLeaves,
        normalizedNodes,
        tags
      );
    }
  );

  // TODO: Add Loro document listener when API is available
  // doc.on('update', (events) => {
  //   syncLoroChangesToLexical(binding, provider, events, false, syncLoroCursorPositions);
  // });
  
  console.log('✅ Sync handlers initialized');
  
  // Return cleanup function
  return () => {
    console.log('🧹 Cleaning up sync handlers');
    removeEditorListener();
    // TODO: Remove Loro document listener when available
    // doc.off('update', handleLoroUpdate);
  };
}

/**
 * New LoroCollaborativePlugin that follows the YJS pattern
 * This version uses incremental updates instead of full editor state replacement
 */
export const LoroCollaborativePlugin = ({
  // id is required by interface but not used
  id: _id, // eslint-disable-line @typescript-eslint/no-unused-vars
  docId,
  websocketUrl = 'ws://localhost:8083',
  onConnectionChange,
  onInitialization,
  onPeerIdChange,
  onPeerCountChange,
  onPeersChange,
}: LoroCollaborativePluginV2Props) => {
  const [editor] = useLexicalComposerContext();
  const initializedRef = useRef(false);
  
  // Use refs to store callbacks to avoid dependency issues
  const callbacksRef = useRef({
    onConnectionChange,
    onInitialization,
    onPeerIdChange,
    onPeerCountChange,
    onPeersChange,
  });
  
  // Update refs when callbacks change
  callbacksRef.current = {
    onConnectionChange,
    onInitialization,
    onPeerIdChange,
    onPeerCountChange,
    onPeersChange,
  };
  
  // Refs to store collaboration objects
  const loroDocRef = useRef<LoroDoc | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const bindingRef = useRef<LoroBinding | null>(null);
  const syncCleanupRef = useRef<(() => void) | null>(null);
  const connectingRef = useRef<boolean>(false);
  
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

        // Create enhanced provider with awareness (following YJS pattern)
        const provider: LoroProvider = {
          doc: loroDoc,
          connected: false,
          awareness: undefined, // TODO: Implement proper awareness when Loro API is available
          connect: async () => {
            console.log('🔌 Provider connect called');
          },
          disconnect: () => {
            console.log('🔌 Provider disconnect called');
          },
          on: () => {}, 
          off: () => {}, 
        };

        // Create Loro binding for collaboration (equivalent to YJS binding)
        const binding = createLoroBinding(
          editor,
          provider,
          docId,
          loroDoc,
          new Map(),
          new Map()
        );
        bindingRef.current = binding;

        // Helper function to process peer list and mark current user
        function processPeerList(peers: PeerInfo[], currentLoroPeerId: string): PeerInfo[] {
          console.log('🔍 Processing peers - Current Loro peer ID:', currentLoroPeerId, 'Peers:', peers);
          const processedPeers = peers.map(peer => {
            // Now compare with Loro peer IDs since server sends them as the primary ID
            const isCurrentUser = peer.id === currentLoroPeerId;
            console.log(`🔍 Peer ${peer.id} === ${currentLoroPeerId}? ${isCurrentUser}`);
            return {
              ...peer,
              isCurrentUser,
              isYou: isCurrentUser
            };
          });
          console.log('🔍 Final processed peers:', processedPeers);
          return processedPeers;
        }

        // Initialize sync handlers (equivalent to YJS sync setup)
        const syncCleanup = initializeLoroSyncHandlers(binding);
        syncCleanupRef.current = syncCleanup;

        // Create WebSocket connection to V2 server
        const wsUrl = `${websocketUrl}/${docId}`;
        console.log('🔌 Connecting to V2 server:', wsUrl);
        
        function connectWebSocket() {
          // Prevent multiple concurrent connection attempts
          if (connectingRef.current || websocketRef.current?.readyState === WebSocket.CONNECTING) {
            console.log('🔄 Already connecting, skipping...');
            return;
          }
          
          connectingRef.current = true;
          const websocket = new WebSocket(wsUrl);
          websocketRef.current = websocket;

          websocket.onopen = () => {
            console.log('✅ V2 WebSocket connected to:', wsUrl);
            console.log('🆔 Client peer ID:', loroDoc.peerIdStr);
            connectingRef.current = false;
            callbacksRef.current.onConnectionChange?.(true);
            callbacksRef.current.onPeerIdChange?.(loroDoc.peerIdStr);
            
            // Send Loro peer ID to server for proper identification
            console.log('📤 Registering Loro peer ID with server:', loroDoc.peerIdStr, 'for doc:', docId);
            websocket.send(JSON.stringify({
              type: 'registerLoroPeerId',
              docId: docId,
              loroPeerId: loroDoc.peerIdStr
            }));
            
            // Clear any reconnect timer
            if (reconnectTimer) {
              clearTimeout(reconnectTimer);
              reconnectTimer = null;
            }
          };

          websocket.onerror = (error) => {
            console.error('❌ V2 WebSocket error:', error);
            connectingRef.current = false;
          };

          websocket.onclose = (event) => {
            console.log('❌ V2 WebSocket disconnected:', event.code, event.reason);
            connectingRef.current = false;
            callbacksRef.current.onConnectionChange?.(false);
            
            // Only attempt to reconnect if this is the current websocket and it wasn't closed intentionally
            if (websocket === websocketRef.current && event.code !== 1000) {
              if (!reconnectTimer) {
                console.log('🔄 Attempting to reconnect in 2 seconds...');
                reconnectTimer = setTimeout(() => {
                  reconnectTimer = null;
                  if (websocketRef.current === websocket) {
                    console.log('🔄 Reconnecting...');
                    connectWebSocket();
                  }
                }, 2000);
              }
            }
          };

          websocket.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);
              console.log('📨 V2 Received message:', message.type, message);

              if (message.type === 'welcome') {
                console.log('👋 Welcome message - peer count:', message.peerCount, 'peers:', message.peers);
                console.log('🔍 RAW Welcome peers received:', message.peers?.map((p: any) => ({ id: p.id, clientId: p.clientId, isCurrentUser: p.isCurrentUser })));
                if (message.peerCount !== undefined) {
                  callbacksRef.current.onPeerCountChange?.(message.peerCount);
                }
                if (message.peers) {
                  const processedPeers = processPeerList(message.peers, loroDoc.peerIdStr);
                  console.log('👥 Processed welcome peers:', processedPeers);
                  callbacksRef.current.onPeersChange?.(processedPeers);
                }
                
              } else if (message.type === 'initial-content' && message.content) {
                console.log('📄 Applying initial Lexical content');
                handleInitialContent(message.content);
                
                if (message.peerCount !== undefined) {
                  callbacksRef.current.onPeerCountChange?.(message.peerCount);
                }
                if (message.peers) {
                  const processedPeers = processPeerList(message.peers, loroDoc.peerIdStr);
                  callbacksRef.current.onPeersChange?.(processedPeers);
                }
                
              } else if (message.type === 'snapshot' && message.snapshot) {
                console.log('📸 Applying initial snapshot');
                handleSnapshot(message.snapshot);
                
                if (message.peerCount !== undefined) {
                  callbacksRef.current.onPeerCountChange?.(message.peerCount);
                }
                if (message.peers) {
                  const processedPeers = processPeerList(message.peers, loroDoc.peerIdStr);
                  callbacksRef.current.onPeersChange?.(processedPeers);
                }
                
                if (!initializedRef.current) {
                  initializedRef.current = true;
                  callbacksRef.current.onInitialization?.(loroDoc);
                }
                
              } else if (message.type === 'peerUpdate') {
                console.log('👥 Peer update - count:', message.peerCount, 'peers:', message.peers);
                console.log('🔍 RAW PeerUpdate peers received:', message.peers?.map((p: any) => ({ id: p.id, clientId: p.clientId, isCurrentUser: p.isCurrentUser })));
                if (message.peerCount !== undefined) {
                  callbacksRef.current.onPeerCountChange?.(message.peerCount);
                }
                if (message.peers) {
                  const processedPeers = processPeerList(message.peers, loroDoc.peerIdStr);
                  console.log('👥 Processed peer update:', processedPeers);
                  callbacksRef.current.onPeersChange?.(processedPeers);
                }
                
              } else if (message.type === 'update' && message.update) {
                console.log('🔄 Applying incremental update from client:', message.clientId);
                handleIncrementalUpdate(message.update);
              }
            } catch (error) {
              console.error('❌ Failed to process V2 message:', error, 'Raw message:', event.data);
            }
          };

          websocket.onerror = (error) => {
            console.error('❌ V2 WebSocket error:', error);
            connectingRef.current = false;
          };
        }

        // Function to handle snapshot from server
        function handleSnapshot(snapshotB64: string) {
          try {
            // Check if this is mock data
            if (snapshotB64 === 'bW9ja19zbmFwc2hvdF9kYXRh') { // base64 for "mock_snapshot_data"
              console.log('📄 Received mock snapshot, skipping import');
              return;
            }
            
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
            console.error('❌ Failed to apply snapshot:', error, 'Snapshot data:', snapshotB64);
          }
        }

        // Function to handle initial Lexical content
        function handleInitialContent(lexicalJsonStr: string) {
          try {
            console.log('📄 Setting initial Lexical content:', lexicalJsonStr.length, 'chars');
            
            // Parse the Lexical JSON
            const lexicalState = JSON.parse(lexicalJsonStr);
            
            // Apply the state directly to the editor
            editor.setEditorState(editor.parseEditorState(lexicalState));
            
            console.log('✅ Initial Lexical content applied successfully');
            
          } catch (error) {
            console.error('❌ Failed to apply initial content:', error, 'Content:', lexicalJsonStr);
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
          
          // Clear reconnect timer
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          
          // Reset connection state
          connectingRef.current = false;
          
          // Close websocket
          if (websocketRef.current) {
            websocketRef.current.close(1000, 'Component unmounting'); // Normal closure
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
  }, [editor, websocketUrl, docId]); // Removed callbacks to prevent infinite loops

  // This plugin doesn't render anything - it just handles collaboration
  return null;
}

export default LoroCollaborativePlugin;
