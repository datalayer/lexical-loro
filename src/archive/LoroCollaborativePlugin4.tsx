/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { useEffect, useRef, useCallback } from 'react';
import { 
  type LexicalEditor,
  type EditorState
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LoroDoc, type LoroEventBatch, type LoroText, type LoroMap } from 'loro-crdt';

const LORO_SYNC_ANNOTATION = 'loro-sync';

interface LoroCollaborativePlugin4Props {
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

// Extract formatting metadata (position-based formatting info)
function extractFormatMetadata(editorState: any): Array<{start: number, end: number, format: number, nodeType: string}> {
  if (!editorState?.root?.children) return [];
  
  const formatRanges: Array<{start: number, end: number, format: number, nodeType: string}> = [];
  let currentPosition = 0;
  
  function processNode(node: any): void {
    const nodeStart = currentPosition;
    
    if (node.type === 'text') {
      const textLength = node.text?.length || 0;
      if (node.format && node.format > 0) {
        formatRanges.push({
          start: currentPosition,
          end: currentPosition + textLength,
          format: node.format,
          nodeType: node.type
        });
      }
      currentPosition += textLength;
    } else if (node.children && Array.isArray(node.children)) {
      // Process children
      for (const child of node.children) {
        processNode(child);
      }
      
      // Record block-level formatting
      if (node.type !== 'root') {
        formatRanges.push({
          start: nodeStart,
          end: currentPosition,
          format: 0, // Block elements don't have text format
          nodeType: node.type
        });
        currentPosition += 1; // Add for newline
      }
    }
  }
  
  processNode(editorState.root);
  return formatRanges;
}

// Extract plain text from Lexical state (like v3)
function extractPlainText(editorState: any): string {
  if (!editorState?.root?.children) return '';
  
  function extractFromNode(node: any): string {
    if (node.text !== undefined) return node.text;
    if (node.children) return node.children.map(extractFromNode).join('');
    return '';
  }
  
  return editorState.root.children.map(extractFromNode).join('\n');
}

// Compute text difference (efficient algorithm from v3)
function computeTextDiff(oldText: string, newText: string): { start: number; deleteCount: number; insertText: string } | null {
  if (oldText === newText) return null;
  
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++;
  }
  
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  
  return {
    start,
    deleteCount: oldEnd - start,
    insertText: newText.slice(start, newEnd)
  };
}

export function LoroCollaborativePlugin4({
  docId,
  websocketUrl,
  onConnectionChange,
  onPeerIdChange
}: LoroCollaborativePlugin4Props) {
  const [editor] = useLexicalComposerContext();
  
  const docRef = useRef<LoroDoc>(new LoroDoc());
  const textRef = useRef<LoroText | null>(null);
  const formatMapRef = useRef<LoroMap | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const hasReceivedInitialSnapshotRef = useRef(false);
  const lastVersionRef = useRef<any>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef(false);
  const lastTextContentRef = useRef<string>('');
  
  useEffect(() => {
    const doc = docRef.current;
    const text = doc.getText('content');
    const formatMap = doc.getMap('formats');
    textRef.current = text;
    formatMapRef.current = formatMap;
    
    console.log('🚀 LoroCollaborativePlugin4 (efficient + formatting) initialized');
  }, [docId]);
  
  const handleLoroUpdate = useCallback((batch: LoroEventBatch) => {
    if (batch.by === 'local') return;
    
    console.log('📥 V4: Received update');
    
    const hasTextUpdate = batch.events.some(event => 
      event.target === textRef.current?.id && event.diff.type === 'text'
    );
    
    const hasFormatUpdate = batch.events.some(event => 
      event.target === formatMapRef.current?.id && event.diff.type === 'map'
    );
    
    if (!hasTextUpdate && !hasFormatUpdate) return;
    
    try {
      const currentText = textRef.current?.toString() || '';
      const storedState = formatMapRef.current?.get('editorState');
      
      console.log('📥 V4: Text length:', currentText.length);
      console.log('📥 V4: Has stored formatting:', !!storedState);
      
      let editorStateJson: any;
      if (storedState && typeof storedState === 'object') {
        // We have rich formatting stored - use it but update the text content
        editorStateJson = storedState as any;
        
        // Update the text content in the rich state while preserving formatting
        const lines = currentText.split('\n');
        const updatedChildren = lines.map((line, index) => {
          // Try to preserve existing formatting from stored state
          const existingChild = editorStateJson.root?.children?.[index];
          if (existingChild && existingChild.children && existingChild.children.length > 0) {
            // Update text while preserving formatting
            const updatedTextNodes = existingChild.children.map((textNode: any) => ({
              ...textNode,
              text: line // Update with current text
            }));
            return {
              ...existingChild,
              children: line ? updatedTextNodes : []
            };
          } else {
            // Fallback to simple paragraph
            return {
              children: line ? [{
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                text: line,
                type: "text",
                version: 1
              }] : [],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "paragraph",
              version: 1
            };
          }
        });
        
        editorStateJson = {
          ...editorStateJson,
          root: {
            ...editorStateJson.root,
            children: updatedChildren
          }
        };
        
        console.log('📥 V4: Using rich formatting with updated text');
      } else {
        // No formatting stored - create simple paragraphs
        const lines = currentText.split('\n');
        const children = lines.map(line => ({
          children: line ? [{
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: line,
            type: "text",
            version: 1
          }] : [],
          direction: "ltr",
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1
        }));
        
        editorStateJson = {
          root: {
            children,
            direction: "ltr",
            format: "",
            indent: 0,
            type: "root",
            version: 1
          }
        };
        console.log('📥 V4: Using simple paragraphs');
      }
      
      lastTextContentRef.current = currentText;
      isRemoteUpdateRef.current = true;
      
      editor.update(() => {
        try {
          const newEditorState = editor.parseEditorState(editorStateJson as any);
          editor.setEditorState(newEditorState);
          console.log('✅ V4: Applied update with formatting');
        } catch (error) {
          console.error('❌ V4: Error applying update:', error);
        }
      }, { tag: LORO_SYNC_ANNOTATION });
      
      isRemoteUpdateRef.current = false;
    } catch (error) {
      console.error('❌ V4: Error handling update:', error);
      isRemoteUpdateRef.current = false;
    }
  }, [editor]);
  
  useEffect(() => {
    const subscription = docRef.current.subscribe(handleLoroUpdate);
    return () => subscription();
  }, [handleLoroUpdate]);
  
  const sendUpdate = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    pendingChangesRef.current = true;
    
    updateTimeoutRef.current = setTimeout(() => {
      if (!pendingChangesRef.current) return;
      
      try {
        const update = lastVersionRef.current 
          ? docRef.current.exportFrom(lastVersionRef.current)
          : docRef.current.exportFrom();
        
        if (update.length === 0) {
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
        
        console.log('📡 V4: Sent efficient update:', update.length, 'bytes');
      } catch (error) {
        console.error('❌ V4: Error sending update:', error);
        pendingChangesRef.current = false;
      }
    }, 50);
  }, [docId]);
  
  const handleEditorChange = useCallback((editorState: EditorState, _editor: LexicalEditor, tags: Set<string>) => {
    if (tags.has(LORO_SYNC_ANNOTATION) || isRemoteUpdateRef.current) return;
    if (!hasReceivedInitialSnapshotRef.current) return;
    
    try {
      const editorStateJson = editorState.toJSON();
      const newText = extractPlainText(editorStateJson);
      const diff = computeTextDiff(lastTextContentRef.current, newText);
      
      // Extract compact formatting metadata (constant size!)
      const currentFormatMetadata = extractFormatMetadata(editorStateJson);
      const lastFormatMetadata = formatMapRef.current?.get('formatMetadata') || [];
      const formattingChanged = JSON.stringify(currentFormatMetadata) !== JSON.stringify(lastFormatMetadata);
      
      console.log('📤 V4: Format metadata length:', JSON.stringify(currentFormatMetadata).length);
      console.log('📤 V4: Formatting changed:', formattingChanged);
      
      if (diff) {
        console.log('📤 V4: Text operation:', diff);
        
        // Apply ONLY text operations to LoroText (constant size!)
        if (diff.deleteCount > 0) {
          textRef.current?.delete(diff.start, diff.deleteCount);
        }
        if (diff.insertText.length > 0) {
          textRef.current?.insert(diff.start, diff.insertText);
        }
        
        // Store ONLY compact formatting metadata (not full state!)
        if (formattingChanged) {
          console.log('📤 V4: Storing compact format metadata (size:', JSON.stringify(currentFormatMetadata).length, ')');
          formatMapRef.current?.set('formatMetadata', currentFormatMetadata);
        } else {
          console.log('📤 V4: Text-only change, no formatting update needed');
        }
        
        lastTextContentRef.current = newText;
        docRef.current.commit();
        sendUpdate();
      } else if (formattingChanged) {
        // Pure formatting change without text change
        console.log('📤 V4: Pure formatting change detected (metadata size:', JSON.stringify(currentFormatMetadata).length, ')');
        formatMapRef.current?.set('formatMetadata', currentFormatMetadata);
        docRef.current.commit();
        sendUpdate();
      } else {
        console.log('📤 V4: No meaningful change detected');
      }
    } catch (error) {
      console.error('❌ V4: Error processing change:', error);
    }
  }, [sendUpdate]);
  
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, tags }) => {
      handleEditorChange(editorState, editor, tags);
    });
  }, [editor, handleEditorChange]);
  
  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket(websocketUrl);
        wsRef.current = ws;
        
        ws.onopen = () => {
          console.log('✅ V4: Connected');
          onConnectionChange?.(true);
        };
        
        ws.onmessage = (event) => {
          try {
            const data: LoroMessage = JSON.parse(event.data);
            
            if (data.type === 'welcome') {
              onPeerIdChange?.(data.clientId || '');
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'request-snapshot', docId }));
                }
              }, 100);
            }
            
            else if (data.type === 'initial-snapshot' && data.docId === docId) {
              if (data.snapshotHex) {
                const snapshot = new Uint8Array(
                  data.snapshotHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                );
                
                docRef.current.import(snapshot);
                hasReceivedInitialSnapshotRef.current = true;
                lastVersionRef.current = docRef.current.version();
                
                const currentText = textRef.current?.toString() || '';
                const storedState = formatMapRef.current?.get('editorState');
                
                if (currentText || storedState) {
                  lastTextContentRef.current = currentText;
                  
                  let editorStateJson = storedState;
                  if (!editorStateJson) {
                    const lines = currentText.split('\n');
                    const children = lines.map(line => ({
                      children: line ? [{
                        detail: 0, format: 0, mode: "normal", style: "",
                        text: line, type: "text", version: 1
                      }] : [],
                      direction: "ltr", format: "", indent: 0,
                      type: "paragraph", version: 1
                    }));
                    
                    editorStateJson = {
                      root: {
                        children, direction: "ltr", format: "",
                        indent: 0, type: "root", version: 1
                      }
                    };
                  }
                  
                  isRemoteUpdateRef.current = true;
                  editor.update(() => {
                    try {
                      const newEditorState = editor.parseEditorState(editorStateJson as any);
                      editor.setEditorState(newEditorState);
                    } catch (error) {
                      console.error('❌ V4: Error applying initial state:', error);
                    }
                  }, { tag: LORO_SYNC_ANNOTATION });
                  isRemoteUpdateRef.current = false;
                }
              }
            }
            
            else if (data.type === 'loro-update' && data.docId === docId) {
              if (data.updateHex) {
                const update = new Uint8Array(
                  data.updateHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                );
                docRef.current.import(update);
                lastVersionRef.current = docRef.current.version();
              }
            }
          } catch (error) {
            console.error('❌ V4: WebSocket message error:', error);
          }
        };
        
        ws.onclose = () => {
          console.log('🔌 V4: Disconnected');
          onConnectionChange?.(false);
        };
        
        ws.onerror = (error) => {
          console.error('❌ V4: WebSocket error:', error);
        };
        
      } catch (error) {
        console.error('❌ V4: Connection error:', error);
      }
    };
    
    connect();
    
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    };
  }, [websocketUrl, docId, editor, onConnectionChange, onPeerIdChange]);
  
  return null;
}
