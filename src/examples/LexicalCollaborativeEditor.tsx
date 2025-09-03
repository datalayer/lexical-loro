/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
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

// Constants
const DOC_ID = 'lexical-shared-doc-3';

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
  const [showMcpDropdown, setShowMcpDropdown] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<string>('');
  const disconnectRef = useRef<(() => void) | null>(null);
  const sendMessageRef = useRef<((message: any) => void) | null>(null);
  const mcpDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mcpDropdownRef.current && !mcpDropdownRef.current.contains(event.target as Node)) {
        setShowMcpDropdown(false);
      }
    };

    if (showMcpDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showMcpDropdown]);

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

  // MCP helper functions
  const callMcpTool = useCallback(async (toolName: string, params: any = {}) => {
    try {
      setMcpStatus(`Calling ${toolName}...`);
      
      // Call MCP tool via the StreamableHTTP protocol
      const response = await fetch('http://localhost:3001/mcp/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: toolName,
            arguments: params
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Parse SSE response
      const responseText = await response.text();
      
      // Extract JSON from SSE format (format: "event: message\ndata: {...}")
      const lines = responseText.split('\n');
      const dataLine = lines.find(line => line.startsWith('data: '));
      
      if (!dataLine) {
        throw new Error('Invalid SSE response format');
      }
      
      const jsonData = dataLine.substring(6); // Remove "data: " prefix
      const result = JSON.parse(jsonData);
      
      if (result.error) {
        throw new Error(result.error.message || 'MCP error');
      }
      
      // Extract the result from MCP response
      let resultText = 'Success';
      if (result.result && result.result.content && result.result.content.length > 0) {
        // MCP returns content array
        const content = result.result.content[0];
        if (content && content.text) {
          try {
            // Try to parse the JSON response to get a cleaner status
            const jsonResponse = JSON.parse(content.text);
            if (jsonResponse.success) {
              resultText = jsonResponse.message || `Success: ${jsonResponse.action || toolName}`;
              if (jsonResponse.total_blocks) {
                resultText += ` (${jsonResponse.total_blocks} blocks)`;
              }
            } else {
              resultText = jsonResponse.error || 'Operation failed';
            }
          } catch {
            // If not JSON, use the raw text
            resultText = content.text;
          }
        }
      }
      
      setMcpStatus(`${toolName}: ${resultText}`);
      console.log(`MCP ${toolName} result:`, result);
      
      // Clear status after 3 seconds
      setTimeout(() => setMcpStatus(''), 3000);
      
      return result;
    } catch (error) {
      const errorMsg = `${toolName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setMcpStatus(errorMsg);
      console.error('MCP tool error:', error);
      
      // Clear error after 5 seconds
      setTimeout(() => setMcpStatus(''), 5000);
    }
  }, []);

  const mcpTools = [
    {
      name: 'load_document',
      label: '📂 Load Document',
      params: { doc_id: DOC_ID }
    },
    {
      name: 'append_paragraph',
      label: '➕ Append Paragraph (MCP)',
      params: { doc_id: DOC_ID, text: 'Hello from MCP!' }
    },
    {
      name: 'insert_paragraph',
      label: '📝 Insert Paragraph at Index 2',
      params: { doc_id: DOC_ID, index: 2, text: 'Inserted at index 2 via MCP!' }
    },
    {
      name: 'get_document_info',
      label: '📄 Get Document Info',
      params: { doc_id: DOC_ID }
    }
  ];

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
                        docId: DOC_ID,
                        message: "Hello"
                      };
                      sendMessageRef.current(command);
                    }
                  }}
                  className="append-paragraph-button"
                  title="Append paragraph with 'Hello' message"
                  style={{ marginLeft: '8px' }}
                >
                  ➕ Append Paragraph
                </button>
                <div ref={mcpDropdownRef} style={{ position: 'relative', display: 'inline-block', marginLeft: '8px' }}>
                  <button 
                    onClick={() => setShowMcpDropdown(!showMcpDropdown)}
                    className="mcp-tools-button"
                    title="MCP Tools"
                    style={{ 
                      backgroundColor: '#4CAF50',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    🔧 MCP Tools ▼
                  </button>
                  {showMcpDropdown && (
                    <div 
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        backgroundColor: 'white',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                        zIndex: 1000,
                        minWidth: '200px',
                        marginTop: '2px'
                      }}
                    >
                      {mcpTools.map((tool, index) => (
                        <button
                          key={tool.name}
                          onClick={() => {
                            callMcpTool(tool.name, tool.params);
                            setShowMcpDropdown(false);
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '8px 12px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: '14px',
                            borderBottom: index < mcpTools.length - 1 ? '1px solid #eee' : 'none'
                          }}
                          onMouseOver={(e) => {
                            (e.target as HTMLElement).style.backgroundColor = '#f5f5f5';
                          }}
                          onMouseOut={(e) => {
                            (e.target as HTMLElement).style.backgroundColor = 'transparent';
                          }}
                          title={`Call MCP tool: ${tool.name}`}
                        >
                          {tool.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <span>Powered by Lexical + Loro CRDT</span>
          {mcpStatus && (
            <div style={{ 
              marginTop: '8px', 
              padding: '4px 8px', 
              backgroundColor: mcpStatus.includes('failed') ? '#ffebee' : '#e8f5e8',
              color: mcpStatus.includes('failed') ? '#c62828' : '#2e7d32',
              borderRadius: '4px',
              fontSize: '12px',
              border: `1px solid ${mcpStatus.includes('failed') ? '#ffcdd2' : '#c8e6c9'}`
            }}>
              MCP: {mcpStatus}
            </div>
          )}
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
            websocketUrl={`${websocketUrl}/${DOC_ID}`}
//            websocketUrl="wss://prod1.datalayer.run/api/spacer/v1/lexical/ws/${DOC_ID}"
            docId={DOC_ID}
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
        <p>Document ID: {DOC_ID}</p>
        <p>Rich text features: Bold, Italic, Lists, Headings, etc.</p>
      </div>
    </div>
  );
};
