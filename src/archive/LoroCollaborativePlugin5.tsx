/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { useEffect, useRef, useCallback } from 'react';
import { type EditorState } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LoroDoc, type LoroEventBatch, type LoroMap } from 'loro-crdt';

const LORO_SYNC_ANNOTATION = 'loro-sync';

/**
 * LoroCollaborativePlugin5 - Clean State-Based Approach
 * 
 * This plugin:
 * 1. Uses Lexical's update listener with prevEditorState
 * 2. Stores editor states in Loro and lets Loro compute the diff
 * 3. Agnostic to content structure - works with any Lexical content
 * 4. Leverages Loro's built-in efficient diff algorithm
 */

interface LoroCollaborativePlugin5Props {
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
}

export function LoroCollaborativePlugin5({
  docId,
  websocketUrl,
  onConnectionChange,
  onPeerIdChange
}: LoroCollaborativePlugin5Props) {
  const [editor] = useLexicalComposerContext();
  
  // Refs for persistent state
  const docRef = useRef<LoroDoc>(new LoroDoc());
  const stateMapRef = useRef<LoroMap | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const hasReceivedInitialSnapshotRef = useRef(false);
  const lastVersionRef = useRef<any>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef(false);
  
  // Initialize Loro document
  useEffect(() => {
    const doc = docRef.current;
    const stateMap = doc.getMap('editorState');
    stateMapRef.current = stateMap;
    
    console.log('🚀 LoroCollaborativePlugin5 (state-based) initialized for docId:', docId);
  }, [docId]);
  
  // Handle remote Loro updates
  const handleLoroUpdate = useCallback((batch: LoroEventBatch) => {
    if (batch.by === 'local') return;
    
    console.log('📥 V5: Received Loro update');
    
    // Check if our state map was updated
    const hasStateUpdate = batch.events.some(event => 
      event.target === stateMapRef.current?.id && event.diff.type === 'map'
    );
    
    if (!hasStateUpdate) return;
    
    try {
      // Get the current editor state from Loro
      const remoteEditorStateJson = stateMapRef.current?.get('current');
      
      if (remoteEditorStateJson && typeof remoteEditorStateJson === 'object') {
        console.log('📥 V5: Applying remote editor state');
        
        isRemoteUpdateRef.current = true;
        
        editor.update(() => {
          try {
            const newEditorState = editor.parseEditorState(remoteEditorStateJson as any);
            editor.setEditorState(newEditorState);
            console.log('✅ V5: Successfully applied remote state');
          } catch (error) {
            console.error('❌ V5: Error parsing remote state:', error);
          }
        }, {
          tag: LORO_SYNC_ANNOTATION
        });
        
        isRemoteUpdateRef.current = false;
      }
    } catch (error) {
      console.error('❌ V5: Error handling Loro update:', error);
      isRemoteUpdateRef.current = false;
    }
  }, [editor]);
  
  // Subscribe to Loro document changes
  useEffect(() => {
    const doc = docRef.current;
    const subscription = doc.subscribe(handleLoroUpdate);
    return () => subscription();
  }, [handleLoroUpdate]);
  
  // Send update to server
  const sendUpdate = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    pendingChangesRef.current = true;
    
    updateTimeoutRef.current = setTimeout(() => {
      if (!pendingChangesRef.current) return;
      
      try {
        let update: Uint8Array;
        
        if (lastVersionRef.current) {
          // Let Loro compute the diff from the last version
          update = docRef.current.exportFrom(lastVersionRef.current);
        } else {
          update = docRef.current.exportFrom();
        }
        
        if (update.length === 0) {
          console.log('📡 V5: No changes to send');
          pendingChangesRef.current = false;
          return;
        }
        
        const updateHex = Array.from(update).map(b => b.toString(16).padStart(2, '0')).join('');
        
        wsRef.current!.send(JSON.stringify({
          type: 'loro-update',
          docId,
          updateHex
        }));
        
        lastVersionRef.current = docRef.current.version();
        pendingChangesRef.current = false;
        
        console.log('📡 V5: Sent Loro-computed diff:', update.length, 'bytes');
      } catch (error) {
        console.error('❌ V5: Error sending update:', error);
        pendingChangesRef.current = false;
      }
    }, 100); // Reasonable debounce
  }, [docId]);
  
  // Handle Lexical editor changes using the update listener API
  const handleEditorChange = useCallback(({ 
    editorState, 
    prevEditorState, 
    tags 
  }: { 
    editorState: EditorState; 
    prevEditorState: EditorState; 
    tags: Set<string>; 
  }) => {
    // Skip if this update came from Loro (prevent infinite loop)
    if (tags.has(LORO_SYNC_ANNOTATION) || isRemoteUpdateRef.current) {
      console.log('📤 V5: Skipping editor change (Loro sync)');
      return;
    }
    
    // Skip if we haven't received initial snapshot yet
    if (!hasReceivedInitialSnapshotRef.current) {
      console.log('📤 V5: Skipping editor change (waiting for snapshot)');
      return;
    }
    
    try {
      const newStateJson = editorState.toJSON();
      const prevStateJson = prevEditorState.toJSON();
      
      // Quick check if states are actually different
      const newStateStr = JSON.stringify(newStateJson);
      const prevStateStr = JSON.stringify(prevStateJson);
      const statesAreDifferent = newStateStr !== prevStateStr;
      
      console.log('📤 V5: Editor change detected:', {
        statesAreDifferent,
        newLength: newStateStr.length,
        prevLength: prevStateStr.length,
        tags: Array.from(tags)
      });
      
      if (statesAreDifferent) {
        console.log('📤 V5: States are different, updating Loro');
        
        // Set the new state in Loro - let Loro handle the diffing!
        stateMapRef.current?.set('current', newStateJson);
        
        // Commit and send the Loro-computed diff
        docRef.current.commit();
        sendUpdate();
      } else {
        console.log('📤 V5: No meaningful state change detected');
      }
    } catch (error) {
      console.error('❌ V5: Error processing editor change:', error);
    }
  }, [sendUpdate]);
  
  // Register the update listener with prevEditorState
  useEffect(() => {
    return editor.registerUpdateListener(handleEditorChange);
  }, [editor, handleEditorChange]);
  
  // WebSocket connection management
  useEffect(() => {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 2000;
    
    const connect = () => {
      try {
        console.log('🔌 V5: Connecting to WebSocket:', websocketUrl);
        const ws = new WebSocket(websocketUrl);
        wsRef.current = ws;
        
        ws.onopen = () => {
          console.log('✅ V5: WebSocket connected');
          reconnectAttempts = 0;
          onConnectionChange?.(true);
        };
        
        ws.onmessage = (event) => {
          try {
            const data: LoroMessage = JSON.parse(event.data);
            console.log('📥 V5: WebSocket message:', data.type);
            
            if (data.type === 'welcome') {
              console.log('👋 V5: Welcome message received:', data.clientId);
              onPeerIdChange?.(data.clientId || '');
              
              // Request initial snapshot immediately
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'request-snapshot',
                  docId
                }));
                console.log('📞 V5: Requested snapshot');
                
                // Set a timeout to mark as ready if no snapshot comes
                // This handles the case where this is the first client and no document exists yet
                setTimeout(() => {
                  if (!hasReceivedInitialSnapshotRef.current) {
                    console.log('⏰ V5: No snapshot received within timeout - assuming fresh document');
                    hasReceivedInitialSnapshotRef.current = true;
                  }
                }, 2000); // 2 second timeout
              }
            }
            
            else if (data.type === 'initial-snapshot' && data.docId === docId) {
              console.log('📄 V5: Received initial snapshot');
              
              if (data.snapshotHex) {
                const snapshot = new Uint8Array(
                  data.snapshotHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                );
                
                console.log('📄 V5: Importing snapshot of', snapshot.length, 'bytes');
                docRef.current.import(snapshot);
                lastVersionRef.current = docRef.current.version();
                
                // Apply the initial state to the editor
                const initialStateJson = stateMapRef.current?.get('current');
                console.log('📄 V5: Initial state from Loro:', initialStateJson ? 'found' : 'empty');
                
                if (initialStateJson && typeof initialStateJson === 'object') {
                  isRemoteUpdateRef.current = true;
                  
                  editor.update(() => {
                    try {
                      const newEditorState = editor.parseEditorState(initialStateJson as any);
                      editor.setEditorState(newEditorState);
                      console.log('✅ V5: Applied initial state');
                    } catch (error) {
                      console.error('❌ V5: Error applying initial state:', error);
                    }
                  }, {
                    tag: LORO_SYNC_ANNOTATION
                  });
                  
                  isRemoteUpdateRef.current = false;
                } else {
                  console.log('📄 V5: No initial state to apply - starting fresh');
                }
              } else {
                console.log('📄 V5: Empty snapshot - starting fresh document');
              }
              
              // Mark as ready to handle changes regardless
              hasReceivedInitialSnapshotRef.current = true;
            }
            
            else if (data.type === 'no-snapshot' && data.docId === docId) {
              console.log('📄 V5: Server reports no snapshot available - starting fresh');
              hasReceivedInitialSnapshotRef.current = true;
            }
            
            else if (data.type === 'loro-update' && data.docId === docId) {
              console.log('🔄 V5: Received update from remote');
              
              if (data.updateHex) {
                const update = new Uint8Array(
                  data.updateHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                );
                
                // Import the update - Loro will trigger our handleLoroUpdate
                docRef.current.import(update);
                lastVersionRef.current = docRef.current.version();
              }
            }
          } catch (error) {
            console.error('❌ V5: Error processing WebSocket message:', error);
          }
        };
        
        ws.onclose = () => {
          console.log('🔌 V5: WebSocket disconnected');
          onConnectionChange?.(false);
          
          // Attempt reconnection
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            console.log(`🔄 V5: Reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
            setTimeout(connect, reconnectDelay);
          } else {
            console.error('❌ V5: Max reconnection attempts reached');
          }
        };
        
        ws.onerror = (error) => {
          console.error('❌ V5: WebSocket error:', error);
        };
        
      } catch (error) {
        console.error('❌ V5: Error creating WebSocket connection:', error);
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
  
  return null;
}
