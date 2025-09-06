/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import React, { useState, useCallback } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { LexicalToolbar } from './LexicalToolbar';
import { CounterNode } from './CounterNode';
import { LoroCollaborativePluginV2, PeerInfo } from '../LoroCollaborativePluginV2';
import { YouTubeNode } from './YouTubeNode';
import { YouTubePlugin } from './YouTubePlugin';
import { lexicalTheme } from './theme';

import "./LexicalCollaborativeEditor.css";

// Constants
const DOC_ID = 'example-v2-doc';
const WEBSOCKET_URL_V2 = 'ws://localhost:8083/collaboration';

interface LexicalCollaborativeEditorV2Props {
  websocketUrl?: string;
  onConnectionChange?: (connected: boolean) => void;
  onInitialization?: (success: boolean) => void;
}

// Catch any errors that occur during Lexical updates and log them
function onError(error: Error) {
  console.error('Lexical error:', error);
}

// Component that renders debug information
function DebugPlugin() {
  const [editor] = useLexicalComposerContext();
  
  const handleDebugState = useCallback(() => {
    console.log('🔍 Debug State button clicked');
    
    editor.getEditorState().read(() => {
      const root = editor.getEditorState()._nodeMap.get('root');
      console.log('📊 Current editor state:', {
        nodeMapSize: editor.getEditorState()._nodeMap.size,
        rootChildren: root ? (root as any).getChildrenSize() : 0
      });
    });
  }, [editor]);

  return (
    <button
      className="disconnect-button"
      onClick={handleDebugState}
      style={{ marginLeft: '10px' }}
    >
      🔍 Debug State
    </button>
  );
}

export function LexicalCollaborativeEditorV2({
  websocketUrl,
  onConnectionChange,
  onInitialization
}: LexicalCollaborativeEditorV2Props) {
  const [connected, setConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [peerId, setPeerId] = useState<string>('');
  const [peerCount, setPeerCount] = useState<number>(0);
  const [peers, setPeers] = useState<PeerInfo[]>([]);

  // Handle connection changes
  const handleConnectionChange = useCallback((connected: boolean) => {
    console.log(`🔌 Connection changed: ${connected ? 'connected' : 'disconnected'}`);
    setConnected(connected);
    onConnectionChange?.(connected);
  }, [onConnectionChange]);

  // Handle initialization
  const handleInitialization = useCallback((initialized: boolean) => {
    console.log(`🚀 Initialization: ${initialized ? 'success' : 'failed'}`);
    setIsInitialized(initialized);
    onInitialization?.(initialized);
  }, [onInitialization]);

  // Handle peer ID changes
  const handlePeerIdChange = useCallback((newPeerId: string) => {
    console.log(`👤 Peer ID changed: ${newPeerId}`);
    setPeerId(newPeerId);
  }, []);

  // Handle peer count changes
  const handlePeerCountChange = useCallback((newPeerCount: number) => {
    console.log(`👥 Peer count changed: ${newPeerCount}`);
    setPeerCount(newPeerCount);
  }, []);

  // Handle peers list changes
  const handlePeersChange = useCallback((newPeers: PeerInfo[]) => {
    console.log(`👥 Peers changed:`, newPeers);
    setPeers(newPeers);
  }, []);

  // Editor configuration
  const initialConfig = {
    namespace: 'LexicalCollaborativeEditorV2',
    theme: lexicalTheme,
    onError,
    nodes: [
      HeadingNode,
      ListNode,
      ListItemNode,
      QuoteNode,
      CodeNode,
      CodeHighlightNode,
      TableNode,
      TableCellNode,
      TableRowNode,
      AutoLinkNode,
      LinkNode,
      CounterNode,
      YouTubeNode,
    ],
  };

  return (
    <div className="lexical-collaborative-editor">
      <div className="lexical-editor-header">
        <h3>✨ Rich Text Editor V2 (Lexical + Loro CRDT)</h3>
        <div className="lexical-editor-info">
          <div className="connection-status">
            <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
              {connected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
            {peerId && <span>👤 Peer: {peerId.slice(0, 8)}</span>}
            {peerCount > 0 && <span>👥 Peers: {peerCount}</span>}
            <button
              className="disconnect-button"
              onClick={() => console.log('🔍 V2 Debug - Connected:', connected, 'Initialized:', isInitialized, 'Peer:', peerId, 'Count:', peerCount, 'Peers:', peers)}
              style={{ marginLeft: '10px' }}
            >
              🔍 Debug Info
            </button>
          </div>
          {peers.length > 0 && (
            <div className="peers-list" style={{ marginTop: '10px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Active Users:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {peers.map((peer) => (
                  <div 
                    key={peer.id} 
                    style={{ 
                      padding: '4px 8px',
                      backgroundColor: peer.isCurrentUser ? '#1ABC9C' : '#f3f4f6',
                      color: peer.isCurrentUser ? '#FFFFFF' : '#666',
                      borderRadius: '12px',
                      fontSize: '12px',
                      border: peer.isCurrentUser ? 'none' : '1px solid #d1d5db'
                    }}
                  >
                    {peer.isCurrentUser ? '👤 You' : `👥 ${peer.displayId}`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <LexicalComposer initialConfig={initialConfig}>
        <div className="lexical-editor-container with-toolbar">
          <LexicalToolbar />
          <RichTextPlugin
            contentEditable={
              <ContentEditable className="lexical-content-editable" />
            }
            placeholder={
              <div className="lexical-placeholder">
                Start typing to test real-time collaboration with incremental updates...
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <TablePlugin 
            hasCellMerge={true}
            hasCellBackgroundColor={true}
          />
          <YouTubePlugin />
          
          {/* Debug plugin inside Lexical context */}
          <DebugPlugin />
          
          {/* NEW: Use V2 plugin that follows YJS pattern */}
          <LoroCollaborativePluginV2
            websocketUrl={websocketUrl || WEBSOCKET_URL_V2}
            docId={DOC_ID}
            onConnectionChange={handleConnectionChange}
            onInitialization={handleInitialization}
            onPeerIdChange={handlePeerIdChange}
            onPeerCountChange={handlePeerCountChange}
            onPeersChange={handlePeersChange}
          />
        </div>
      </LexicalComposer>

      <div className="lexical-editor-footer">
        <p><strong>🔄 V2 Improvements:</strong></p>
        <p>• Uses incremental updates instead of full editor state replacement</p>
        <p>• Prevents decorator nodes (YouTube, Counter) from reloading during collaboration</p>
        <p>• Follows the YJS collaboration pattern for better performance</p>
        <p>• {isInitialized ? '✅ Initialized successfully' : '⏳ Initializing...'}</p>
      </div>
    </div>
  );
}

export default LexicalCollaborativeEditorV2;
