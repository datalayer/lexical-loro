/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import React, { useState, useCallback, useEffect } from 'react';
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
import { LoroDoc } from 'loro-crdt';
import { YouTubeNode } from './YouTubeNode';
import { YouTubePlugin } from './YouTubePlugin';
import { lexicalTheme } from './theme';

// Import our Loro collaboration infrastructure (following YJS pattern)
import { LoroCollaborationPlugin } from '../LoroCollaborationPlugin';
import { createLoroProvider, type LoroProvider, LORO_CONNECTED_COMMAND } from '../collaboration';

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

// Component that listens to connection status changes
function ConnectionStatusPlugin({
  onConnectionChange,
}: {
  onConnectionChange?: (connected: boolean) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregister = editor.registerCommand(
      LORO_CONNECTED_COMMAND,
      (connected: boolean) => {
        console.log('🔌 Connection status changed:', connected);
        onConnectionChange?.(connected);
        return false; // Allow other listeners
      },
      1 // Priority
    );

    return () => {
      unregister();
    };
  }, [editor, onConnectionChange]);

  return null;
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
  websocketUrl = WEBSOCKET_URL_V2,
  onConnectionChange,
  // onInitialization // TODO: Wire up when LoroCollaborationPlugin supports it
}: LexicalCollaborativeEditorV2Props) {
  const [connected, setConnected] = useState(false);
  // const [isInitialized, setIsInitialized] = useState(false); // TODO: Implement when supported

  // Handle connection status changes from the collaboration plugin
  const handleConnectionChange = useCallback((newConnected: boolean) => {
    setConnected(newConnected);
    onConnectionChange?.(newConnected);
  }, [onConnectionChange]);

  // Handle initialization (for future use when plugin supports it)
  // const handleInitialization = useCallback((success: boolean) => {
  //   setIsInitialized(success);
  //   onInitialization?.(success);
  // }, [onInitialization]);

  // Provider factory that uses the websocketUrl parameter (following YJS pattern)
  const providerFactory = useCallback((id: string, loroDocMap: Map<string, LoroDoc>): LoroProvider => {
    console.log('🏭 Creating Loro provider for document:', id, 'URL:', websocketUrl);
    
    // Get or create document for this ID (following YJS pattern)
    let doc = loroDocMap.get(id);
    if (!doc) {
      doc = new LoroDoc();
      loroDocMap.set(id, doc);
    }
    
    return createLoroProvider(websocketUrl, id, doc);
  }, [websocketUrl]);

  // Editor configuration
  const initialConfig = {
    editorState: null,
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
            <button
              className="disconnect-button"
              onClick={() => console.log('🔍 V2 Debug - Connected:', connected)}
              style={{ marginLeft: '10px' }}
            >
              🔍 Debug Info
            </button>
          </div>
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
          
          {/* Connection status listener */}
          <ConnectionStatusPlugin onConnectionChange={handleConnectionChange} />
          
          <LoroCollaborationPlugin
            id={DOC_ID}
            providerFactory={providerFactory}
            shouldBootstrap={true}
            username="V2User"
            cursorColor="#3366cc"
          />
        </div>
      </LexicalComposer>

      <div className="lexical-editor-footer">
        <p><strong>🔄 V2 Improvements:</strong></p>
        <p>• Uses incremental updates instead of full editor state replacement</p>
        <p>• Prevents decorator nodes (YouTube, Counter) from reloading during collaboration</p>
        <p>• Follows the YJS collaboration pattern for better performance</p>
        <p>• Connection status: {connected ? '✅ Connected' : '⏳ Connecting...'}</p>
      </div>
    </div>
  );
}

export default LexicalCollaborativeEditorV2;
