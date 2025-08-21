/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { useEffect, useRef, useCallback } from 'react';
import { 
  type LexicalEditor,
  type EditorState,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LoroDoc, type LoroEventBatch, type LoroMap } from 'loro-crdt';

/**
 * Annotation to mark updates coming from Loro to prevent infinite loops
 */
const LORO_SYNC_ANNOTATION = 'loro-sync';

/**
 * Clean LoroCollaborativePlugin2 inspired by CodeMirror integration
 * 
 * This plugin:
 * 1. Listens to Lexical editor state changes
 * 2. Stores the JSON representation in a Loro Map
 * 3. Listens to remote Loro updates and applies them to Lexical
 * 4. Sends updates via WebSocket
 * 5. Simple, no complex text diffing or cursor hacks
 */

interface LoroCollaborativePlugin2Props {
  docId: string;
  websocketUrl: string;
  onConnectionChange?: (connected: boolean) => void;
  onPeerIdChange?: (peerId: string) => void;
}

interface LoroMessage {
  type: string;
  docId?: string;
  updateHex?: string;
  snapshotHex?: string;
  clientId?: string;
  color?: string;
}

export function LoroCollaborativePlugin2({
  docId,
  websocketUrl,
  onConnectionChange,
  onPeerIdChange
}: LoroCollaborativePlugin2Props) {
  const [editor] = useLexicalComposerContext();
  
  // Refs for persistent state
  const docRef = useRef<LoroDoc>(new LoroDoc());
  const mapRef = useRef<LoroMap | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const hasReceivedInitialSnapshotRef = useRef(false);
  const lastVersionRef = useRef<any>(null); // Store version vector
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef(false); // Track if we have pending changes to send
  
  // Initialize Loro document and map
  useEffect(() => {
    const doc = docRef.current;
    const map = doc.getMap(docId);
    mapRef.current = map;
    
    console.log('🚀 LoroCollaborativePlugin2 initialized for docId:', docId);
  }, [docId]);
  
  // Handle remote Loro updates
  const handleLoroUpdate = useCallback((batch: LoroEventBatch) => {
    // Skip local updates
    if (batch.by === 'local') {
      return;
    }
    
    console.log('📥 Received Loro update:', batch.by, batch.events.length, 'events');
    
    // Check if any events affect our map
    const hasMapUpdate = batch.events.some(event => 
      event.target === mapRef.current?.id && event.diff.type === 'map'
    );
    
    if (!hasMapUpdate) {
      return;
    }
    
    try {
      // Get the current editor state from the map
      const editorStateJson = mapRef.current?.get('editorState');
      
      if (editorStateJson && typeof editorStateJson === 'object') {
        console.log('🔄 Applying remote editor state update');
        
        // Mark as remote update to prevent loop
        isRemoteUpdateRef.current = true;
        
        editor.update(() => {
          try {
            // Parse and set the new editor state
            const newEditorState = editor.parseEditorState(editorStateJson as any);
            editor.setEditorState(newEditorState);
            console.log('✅ Successfully applied remote editor state');
          } catch (error) {
            console.error('❌ Error parsing remote editor state:', error);
          }
        }, {
          tag: LORO_SYNC_ANNOTATION
        });
        
        isRemoteUpdateRef.current = false;
      }
    } catch (error) {
      console.error('❌ Error handling Loro update:', error);
      isRemoteUpdateRef.current = false;
    }
  }, [editor]);
  
  // Subscribe to Loro document changes
  useEffect(() => {
    const doc = docRef.current;
    const subscription = doc.subscribe(handleLoroUpdate);
    
    return () => {
      subscription();
    };
  }, [handleLoroUpdate]);
  
  // Send update to server with minimal diffs using Loro transactions
  const sendUpdate = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // Clear any pending update
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    // Mark that we have pending changes
    pendingChangesRef.current = true;
    
    // Debounce rapid changes
    updateTimeoutRef.current = setTimeout(() => {
      if (!pendingChangesRef.current) {
        return; // No changes to send
      }
      
      try {
        let update: Uint8Array;
        
        if (lastVersionRef.current) {
          // Export only changes since the last version (minimal diff)
          update = docRef.current.exportFrom(lastVersionRef.current);
        } else {
          // First export - get all changes since beginning
          update = docRef.current.exportFrom();
        }
        
        // Only send if there are actual changes
        if (update.length === 0) {
          console.log('📡 No changes to send');
          pendingChangesRef.current = false;
          return;
        }
        
        const updateHex = Array.from(update).map(b => b.toString(16).padStart(2, '0')).join('');
        
        wsRef.current!.send(JSON.stringify({
          type: 'loro-update',
          docId,
          updateHex
        }));
        
        // Update the last version to the current state ONLY after successful send
        lastVersionRef.current = docRef.current.version();
        pendingChangesRef.current = false;
        
        console.log('📡 Sent minimal update to server:', update.length, 'bytes');
      } catch (error) {
        console.error('❌ Error sending update:', error);
        pendingChangesRef.current = false;
      }
    }, 50); // 50ms debounce
  }, [docId]);
  
  // Handle local Lexical editor changes with minimal updates
  const handleEditorChange = useCallback((editorState: EditorState, _editor: LexicalEditor, tags: Set<string>) => {
    // Skip if this update came from Loro (prevent infinite loop)
    if (tags.has(LORO_SYNC_ANNOTATION) || isRemoteUpdateRef.current) {
      return;
    }
    
    // Skip if we haven't received initial snapshot yet
    if (!hasReceivedInitialSnapshotRef.current) {
      return;
    }
    
    try {
      // Convert editor state to JSON
      const editorStateJson = editorState.toJSON();
      
      console.log('📤 Local editor change, updating Loro map with transaction');
      
      // Use a transaction to group the change for minimal diff
      const currentValue = mapRef.current?.get('editorState');
      
      // Only update if the content actually changed
      if (JSON.stringify(currentValue) !== JSON.stringify(editorStateJson)) {
        // Update the map and commit as a single operation
        mapRef.current?.set('editorState', editorStateJson);
        docRef.current.commit();
        
        // Send update to server immediately after commit
        sendUpdate();
      } else {
        console.log('📤 No actual content change, skipping update');
      }
    } catch (error) {
      console.error('❌ Error handling local editor change:', error);
    }
  }, [sendUpdate]);
  
  // Register editor change listener
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, tags }) => {
      handleEditorChange(editorState, editor, tags);
    });
  }, [editor, handleEditorChange]);
  
  // WebSocket connection management
  useEffect(() => {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 2000;
    
    const connect = () => {
      try {
        console.log('🔌 Connecting to WebSocket:', websocketUrl);
        const ws = new WebSocket(websocketUrl);
        wsRef.current = ws;
        
        ws.onopen = () => {
          console.log('✅ WebSocket connected');
          reconnectAttempts = 0;
          onConnectionChange?.(true);
        };
        
        ws.onmessage = (event) => {
          try {
            const data: LoroMessage = JSON.parse(event.data);
            console.log('📥 WebSocket message:', data.type);
            
            if (data.type === 'welcome') {
              console.log('👋 Welcome message received:', data.clientId);
              onPeerIdChange?.(data.clientId || '');
              
              // Request initial snapshot
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'request-snapshot',
                    docId
                  }));
                  console.log('📞 Requested initial snapshot');
                }
              }, 100);
            }
            
            else if (data.type === 'initial-snapshot' && data.docId === docId) {
              console.log('📄 Received initial snapshot');
              
              if (data.snapshotHex) {
                const snapshot = new Uint8Array(
                  data.snapshotHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                );
                
                docRef.current.import(snapshot);
                hasReceivedInitialSnapshotRef.current = true;
                // Initialize the version tracking after receiving initial snapshot
                lastVersionRef.current = docRef.current.version();
                
                // Apply the initial state to the editor
                const editorStateJson = mapRef.current?.get('editorState');
                if (editorStateJson && typeof editorStateJson === 'object') {
                  isRemoteUpdateRef.current = true;
                  
                  editor.update(() => {
                    try {
                      const newEditorState = editor.parseEditorState(editorStateJson as any);
                      editor.setEditorState(newEditorState);
                      console.log('✅ Applied initial editor state');
                    } catch (error) {
                      console.error('❌ Error applying initial state:', error);
                    }
                  }, {
                    tag: LORO_SYNC_ANNOTATION
                  });
                  
                  isRemoteUpdateRef.current = false;
                }
              }
            }
            
            else if (data.type === 'loro-update' && data.docId === docId) {
              console.log('🔄 Received Loro update from remote');
              
              if (data.updateHex) {
                const update = new Uint8Array(
                  data.updateHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                );
                
                docRef.current.import(update);
                // Update version after receiving remote update
                lastVersionRef.current = docRef.current.version();
              }
            }
          } catch (error) {
            console.error('❌ Error processing WebSocket message:', error);
          }
        };
        
        ws.onclose = () => {
          console.log('🔌 WebSocket disconnected');
          onConnectionChange?.(false);
          
          // Attempt reconnection
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            console.log(`🔄 Reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
            setTimeout(connect, reconnectDelay);
          } else {
            console.error('❌ Max reconnection attempts reached');
          }
        };
        
        ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
        };
        
      } catch (error) {
        console.error('❌ Error creating WebSocket connection:', error);
      }
    };
    
    connect();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [websocketUrl, docId, editor, onConnectionChange, onPeerIdChange]);
  
  return null; // This is a headless plugin
}
