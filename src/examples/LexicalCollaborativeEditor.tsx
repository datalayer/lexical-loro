/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import React, { useState, useCallback, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
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
import LoroCollaborativePlugin from '../LoroCollaborativePlugin';
import { lexicalTheme } from './theme';

import "./LexicalCollaborativeEditor.css";

interface LexicalCollaborativeEditorProps {
  websocketUrl: string;
  onConnectionChange?: (connected: boolean) => void;
  onInitialization?: (success: boolean) => void;
}

// Catch any errors that occur during Lexical updates and log them
// or throw them as needed.
function onError(error: Error) {
  console.error('Lexical error:', error);
}

export const LexicalCollaborativeEditor: React.FC<LexicalCollaborativeEditorProps> = ({
  websocketUrl,
  onConnectionChange,
  onInitialization
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [peerId, setPeerId] = useState<string>('');
  const [awarenessData, setAwarenessData] = useState<Array<{peerId: string, userName: string, isCurrentUser?: boolean}>>([]);
  const disconnectRef = useRef<(() => void) | null>(null);
  const sendMessageRef = useRef<((message: any) => void) | null>(null);

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsConnected(connected);
    onConnectionChange?.(connected);
  }, [onConnectionChange]);

  const handleDisconnect = useCallback(() => {
    if (disconnectRef.current) {
      disconnectRef.current();
      setIsConnected(false);
      onConnectionChange?.(false);
    }
  }, [onConnectionChange]);

  const handlePeerIdChange = useCallback((newPeerId: string) => {
    setPeerId(newPeerId);
  }, []);

  const handleAwarenessChange = useCallback((awareness: Array<{peerId: string, userName: string, isCurrentUser?: boolean}>) => {
    setAwarenessData(awareness);
  }, []);

  const handleInitialization = useCallback((success: boolean) => {
    setIsInitialized(success);
    onInitialization?.(success);
  }, [onInitialization]);

  const initialConfig = {
    namespace: 'LexicalCollaborativeEditor',
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
    ],
  };

  return (
    <div className="lexical-collaborative-editor">
      <div className="lexical-editor-header">
        <h3>Lexical Rich Text Editor (Collaborative)</h3>
        <div className="lexical-editor-info">
          <div className="connection-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
            <span className={`status-indicator ${isInitialized ? 'initialized' : 'initializing'}`} style={{ marginLeft: '10px' }}>
              {isInitialized ? '✅ Initialized' : '⏳ Initializing...'}
            </span>
            {peerId && (
              <span className="peer-id-display" style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
                Peer ID: {peerId}
              </span>
            )}
            {awarenessData.length > 0 && (
              <div className="awareness-display" style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
                <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>Active Users:</div>
                {awarenessData.map((peer) => (
                  <div 
                    key={peer.peerId} 
                    style={{ 
                      marginLeft: '5px', 
                      marginBottom: '2px',
                      padding: '2px 6px', 
                      backgroundColor: peer.isCurrentUser ? '#e6f3ff' : '#f0f0f0', 
                      borderRadius: '3px',
                      border: peer.isCurrentUser ? '1px solid #007acc' : 'none',
                      display: 'block'
                    }}
                  >
                    {peer.userName} (peer:{peer.peerId}){peer.isCurrentUser ? ' (Me 👽)' : ''}
                  </div>
                ))}
              </div>
            )}
            {isConnected && (
              <>
                <button 
                  onClick={handleDisconnect}
                  className="disconnect-button"
                  title="Disconnect from server"
                >
                  🔌 Disconnect
                </button>
                <button 
                  onClick={() => {
                    // Send append-paragraph command via websocket
                    if (sendMessageRef.current) {
                      const command = {
                        type: "append-paragraph",
                        docId: "lexical-shared-doc",
                        message: "Hello"
                      };
                      sendMessageRef.current(command);
                    }
                  }}
                  className="append-paragraph-button"
                  title="Add paragraph with 'Hello' message"
                  style={{ marginLeft: '8px' }}
                >
                  ➕ Add Paragraph
                </button>
              </>
            )}
          </div>
          <span>Powered by Lexical + Loro CRDT</span>
        </div>
      </div>
      
      <LexicalComposer initialConfig={initialConfig}>
        <LexicalToolbar />
        <div className="lexical-editor-container with-toolbar">
          <RichTextPlugin
            contentEditable={
              <ContentEditable className="lexical-content-editable" />
            }
            placeholder={
              <div className="lexical-placeholder">
                Start typing in the rich text editor... Your changes will be shared in real-time!
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <TablePlugin hasCellMerge={true} hasCellBackgroundColor={true} />
          <LoroCollaborativePlugin
            websocketUrl={websocketUrl}
//            websocketUrl="wss://prod1.datalayer.run/api/spacer/v1/lexical/ws/lexical-shared-doc"
            docId="lexical-shared-doc"
            onConnectionChange={handleConnectionChange}
            onPeerIdChange={handlePeerIdChange}
            onAwarenessChange={handleAwarenessChange}
            onInitialization={handleInitialization}
            onDisconnectReady={(disconnectFn) => {
              disconnectRef.current = disconnectFn;
            }}
            onSendMessageReady={(sendMessageFn) => {
              sendMessageRef.current = sendMessageFn;
            }}
          />
        </div>
      </LexicalComposer>
      
      <div className="lexical-editor-footer">
        <p>Document ID: lexical-shared-doc</p>
        <p>Rich text features: Bold, Italic, Lists, Headings, etc.</p>
      </div>
    </div>
  );
};
