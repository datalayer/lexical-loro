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
import { LoroCollaborativePluginV3, PeerInfo } from '../LoroCollaborativePluginV3';
import { YouTubeNode } from './YouTubeNode';
import { YouTubePlugin } from './YouTubePlugin';
import { lexicalTheme } from './theme';

import "./LexicalCollaborativeEditor.css";

// Constants
const DOC_ID = 'example-v3-doc';
const WEBSOCKET_URL_V3 = 'ws://localhost:8083/collaboration';

interface LexicalCollaborativeEditorV3Props {
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

export function LexicalCollaborativeEditorV3({
  websocketUrl,
  onConnectionChange,
  onInitialization
}: LexicalCollaborativeEditorV3Props) {
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
  const handleInitialization = useCallback((doc: any) => {
    console.log(`🚀 Initialization: doc received`, doc);
    setIsInitialized(true);
    onInitialization?.(true);
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

  // Handle peers list changes with detailed logging
  const handlePeersChange = useCallback((newPeers: Array<{ id: string; clientId: string; isYou?: boolean; displayId?: string; isCurrentUser?: boolean }>) => {
    console.log('👥 Peers changed - Current peer ID:', peerId);
    console.log('👥 Received peers:', newPeers);
    
    // Convert to PeerInfo format for state
    const peerInfos: PeerInfo[] = newPeers.map(peer => ({
      id: peer.id,
      clientId: peer.clientId,
      displayId: peer.displayId || peer.id.split('_')[-1] || peer.id.slice(0, 8),
      isCurrentUser: peer.isCurrentUser || !!peer.isYou,
      isYou: peer.isYou
    }));
    
    peerInfos.forEach((peer, index) => {
      console.log(`👥 Peer ${index}:`, {
        id: peer.id,
        displayId: peer.displayId,
        isCurrentUser: peer.isCurrentUser,
        isYou: peer.isYou
      });
    });
    setPeers(peerInfos);
  }, [peerId]);

  // Editor configuration
  const initialConfig = {
    editorState: null,
    namespace: 'LexicalCollaborativeEditorV3',
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
        <h3>✨ Rich Text Editor V3 (Lexical + Loro CRDT + Collaboration Nodes)</h3>
        <div className="lexical-editor-info">
          <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
          <span className="peer-info">
            👤 Peer: {peerId || 'Unknown'} | 👥 Total: {peerCount}
          </span>
          <span className="init-status">
            {isInitialized ? '✅ Initialized' : '⏳ Initializing...'}
          </span>
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
                Start typing your collaborative document... 
                (V3 - Full Collaboration Node Architecture)
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
          <DebugPlugin />
          <LoroCollaborativePluginV3
            id="collaborative-editor-v3"
            websocketUrl={websocketUrl || WEBSOCKET_URL_V3}
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
        <p><strong>V3 Features:</strong></p>
        <p>• Uses full collaboration node architecture (LoroCollabElementNode, LoroCollabTextNode, etc.)</p>
        <p>• Follows YJS pattern exactly with proper collaboration infrastructure</p>
        <p>• Implements LoroBinding with collaboration node map like YJS Binding</p>
        <p>• Eliminates setEditorState usage in favor of incremental updates</p>
        <p>• Proper awareness integration for cursors and presence</p>
        <div className="peers-list">
          <strong>Connected Peers:</strong>
          {peers.length > 0 ? (
            <ul>
              {peers.map((peer, index) => (
                <li key={peer.id} className={peer.isCurrentUser ? 'current-user' : ''}>
                  {peer.displayId} {peer.isCurrentUser ? '(You)' : ''} - {peer.clientId}
                </li>
              ))}
            </ul>
          ) : (
            <span> None</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default LexicalCollaborativeEditorV3;
