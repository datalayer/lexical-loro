/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { useEffect, useRef, useCallback } from 'react';
import { 
  type LexicalEditor,
  type EditorState,
  $getRoot,
  $createParagraphNode,
  $createTextNode
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LoroDoc, type LoroEventBatch, type LoroText } from 'loro-crdt';

/**
 * Annotation to mark updates coming from Loro to prevent infinite loops
 */
const LORO_SYNC_ANNOTATION = 'loro-sync';

/**
 * Ultra-clean LoroCollaborativePlugin3 with minimal text-only approach
 * 
 * This plugin:
 * 1. Extracts plain text from Lexical editor
 * 2. Stores it in a Loro Text container for minimal diffs
 * 3. Applies text changes back to Lexical
 * 4. Sends only character-level diffs
 */

interface LoroCollaborativePlugin3Props {
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

export function LoroCollaborativePlugin3({
  docId,
  websocketUrl,
  onConnectionChange,
  onPeerIdChange
}: LoroCollaborativePlugin3Props) {
  const [editor] = useLexicalComposerContext();
  
  // Refs for persistent state
  const docRef = useRef<LoroDoc>(new LoroDoc());
  const textRef = useRef<LoroText | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const hasReceivedInitialSnapshotRef = useRef(false);
  const lastVersionRef = useRef<any>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef(false);
  
  // Initialize Loro document and text
  useEffect(() => {
    const doc = docRef.current;
    const text = doc.getText(docId);
    textRef.current = text;
    
    console.log('🚀 LoroCollaborativePlugin3 (text-based) initialized for docId:', docId);
  }, [docId]);
  
  // Extract plain text from Lexical editor state
  const extractPlainText = useCallback((editorState: EditorState): string => {
    let text = '';
    editorState.read(() => {
      const root = $getRoot();
      text = root.getTextContent();
    });
    return text;
  }, []);
  
  // Apply plain text to Lexical editor
  const applyPlainText = useCallback((text: string) => {
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      
      if (text.trim()) {
        const lines = text.split('\n');
        lines.forEach((line) => {
          const paragraph = $createParagraphNode();
          if (line.trim()) {
            const textNode = $createTextNode(line);
            paragraph.append(textNode);
          }
          root.append(paragraph);
        });
      } else {
        // Empty content
        const paragraph = $createParagraphNode();
        root.append(paragraph);
      }
    }, {
      tag: LORO_SYNC_ANNOTATION
    });
  }, [editor]);
  
  // Handle remote Loro text updates
  const handleLoroUpdate = useCallback((batch: LoroEventBatch) => {
    // Skip local updates
    if (batch.by === 'local') {
      return;
    }
    
    console.log('📥 Received Loro text update:', batch.by, batch.events.length, 'events');
    
    // Check if any events affect our text
    const hasTextUpdate = batch.events.some(event => 
      event.target === textRef.current?.id && event.diff.type === 'text'
    );
    
    if (!hasTextUpdate) {
      return;
    }
    
    try {
      // Get the current text from Loro
      const currentText = textRef.current?.toString() || '';
      
      console.log('🔄 Applying remote text update:', currentText.length, 'chars');
      
      // Mark as remote update to prevent loop
      isRemoteUpdateRef.current = true;
      
      // Apply the text to the editor
      applyPlainText(currentText);
      
      isRemoteUpdateRef.current = false;
      console.log('✅ Successfully applied remote text update');
    } catch (error) {
      console.error('❌ Error handling Loro text update:', error);
      isRemoteUpdateRef.current = false;
    }
  }, [applyPlainText]);
  
  // Subscribe to Loro document changes
  useEffect(() => {
    const doc = docRef.current;
    const subscription = doc.subscribe(handleLoroUpdate);
    
    return () => {
      subscription();
    };
  }, [handleLoroUpdate]);
  
  // Send minimal text update to server
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
        return;
      }
      
      try {
        let update: Uint8Array;
        
        if (lastVersionRef.current) {
          // Export only changes since the last version (minimal diff)
          update = docRef.current.exportFrom(lastVersionRef.current);
        } else {
          // First export
          update = docRef.current.exportFrom();
        }
        
        // Only send if there are actual changes
        if (update.length === 0) {
          console.log('📡 No text changes to send');
          pendingChangesRef.current = false;
          return;
        }
        
        const updateHex = Array.from(update).map(b => b.toString(16).padStart(2, '0')).join('');
        
        wsRef.current!.send(JSON.stringify({
          type: 'loro-update',
          docId,
          updateHex
        }));
        
        // Update the last version ONLY after successful send
        lastVersionRef.current = docRef.current.version();
        pendingChangesRef.current = false;
        
        console.log('📡 Sent minimal text update to server:', update.length, 'bytes');
      } catch (error) {
        console.error('❌ Error sending text update:', error);
        pendingChangesRef.current = false;
      }
    }, 50); // 50ms debounce
  }, [docId]);
  
  // Calculate text diff and apply to Loro Text
  const applyTextDiff = useCallback((oldText: string, newText: string) => {
    if (!textRef.current) return;
    
    // Simple diff algorithm - find common prefix and suffix
    let start = 0;
    let oldEnd = oldText.length;
    let newEnd = newText.length;
    
    // Find common prefix
    while (start < oldEnd && start < newEnd && oldText[start] === newText[start]) {
      start++;
    }
    
    // Find common suffix
    while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    
    // Apply the minimal diff to Loro Text
    const deletedText = oldText.slice(start, oldEnd);
    const insertedText = newText.slice(start, newEnd);
    
    console.log('📝 Text diff:', {
      start,
      deleted: deletedText.length,
      inserted: insertedText.length,
      deletedText: deletedText.slice(0, 50) + (deletedText.length > 50 ? '...' : ''),
      insertedText: insertedText.slice(0, 50) + (insertedText.length > 50 ? '...' : '')
    });
    
    // Apply changes to Loro Text
    if (deletedText.length > 0) {
      textRef.current.delete(start, deletedText.length);
    }
    if (insertedText.length > 0) {
      textRef.current.insert(start, insertedText);
    }
    
    // Commit the changes
    docRef.current.commit();
  }, []);
  
  // Handle local Lexical editor changes with text diffing
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
      // Extract plain text from the new editor state
      const newText = extractPlainText(editorState);
      const oldText = textRef.current?.toString() || '';
      
      // Only update if the text actually changed
      if (newText !== oldText) {
        console.log('📤 Local text change detected:', {
          oldLength: oldText.length,
          newLength: newText.length
        });
        
        // Apply minimal diff to Loro Text
        applyTextDiff(oldText, newText);
        
        // Send update to server
        sendUpdate();
      }
    } catch (error) {
      console.error('❌ Error handling local editor change:', error);
    }
  }, [extractPlainText, applyTextDiff, sendUpdate]);
  
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
              console.log('📄 Received initial text snapshot');
              
              if (data.snapshotHex) {
                const snapshot = new Uint8Array(
                  data.snapshotHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                );
                
                docRef.current.import(snapshot);
                hasReceivedInitialSnapshotRef.current = true;
                lastVersionRef.current = docRef.current.version();
                
                // Apply the initial text to the editor
                const currentText = textRef.current?.toString() || '';
                if (currentText) {
                  isRemoteUpdateRef.current = true;
                  applyPlainText(currentText);
                  isRemoteUpdateRef.current = false;
                  console.log('✅ Applied initial text state');
                }
              }
            }
            
            else if (data.type === 'loro-update' && data.docId === docId) {
              console.log('🔄 Received Loro text update from remote');
              
              if (data.updateHex) {
                const update = new Uint8Array(
                  data.updateHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                );
                
                docRef.current.import(update);
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
  }, [websocketUrl, docId, onConnectionChange, onPeerIdChange, applyPlainText]);
  
  return null; // This is a headless plugin
}
