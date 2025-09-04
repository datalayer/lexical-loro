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
const DOC_ID = 'example-1';

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
  const [documentContent, setDocumentContent] = useState<any>(null);
  const [showDocumentTree, setShowDocumentTree] = useState(true);
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
    // Guard: Don't allow MCP calls until the system is fully initialized
    if (!isInitialized) {
      setMcpStatus(`${toolName} failed: System not yet initialized`);
      setTimeout(() => setMcpStatus(''), 3000);
      return;
    }

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
      
      // Update document content if this was get_document_info or any document-modifying operation
      if (toolName === 'get_document_info' && result.result && result.result.content && result.result.content.length > 0) {
        try {
          const content = JSON.parse(result.result.content[0].text);
          if (content.content) {
            setDocumentContent(content.content);
          }
        } catch (error) {
          console.error('Failed to parse document content:', error);
        }
      } else if (['append_paragraph', 'insert_paragraph', 'load_document'].includes(toolName)) {
        // Refresh document content after modifying operations
        setTimeout(async () => {
          try {
            const docResult = await callMcpTool('get_document_info', { doc_id: DOC_ID });
            if (docResult?.result?.content?.[0]?.text) {
              const content = JSON.parse(docResult.result.content[0].text);
              if (content.content) {
                setDocumentContent(content.content);
              }
            }
          } catch (error) {
            console.error('Failed to refresh document content:', error);
          }
        }, 500); // Small delay to ensure the operation has completed
      }
      
      // Keep status displayed permanently for get_document_info, clear after 3 seconds for others
      if (toolName === 'get_document_info') {
        // Don't auto-clear for document info - user can see the persistent data in the tree below
      } else {
        // Clear status after 3 seconds for other operations
        setTimeout(() => setMcpStatus(''), 3000);
      }
      
      return result;
    } catch (error) {
      const errorMsg = `${toolName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setMcpStatus(errorMsg);
      console.error('MCP tool error:', error);
      
      // Clear error after 5 seconds for all tools
      setTimeout(() => setMcpStatus(''), 5000);
    }
  }, [isInitialized]);

  // Auto-load document content when initialized
  useEffect(() => {
    if (isInitialized) {
      const loadContent = async () => {
        try {
          const result = await callMcpTool('get_document_info', { doc_id: DOC_ID });
          if (result?.result?.content?.[0]?.text) {
            const content = JSON.parse(result.result.content[0].text);
            if (content.content) {
              setDocumentContent(content.content);
            }
          }
        } catch (error) {
          console.error('Failed to load document content:', error);
        }
      };
      loadContent();
    }
  }, [isInitialized, callMcpTool]);

  // JSON Tree Component
  const JsonTree = ({ data, level = 0 }: { data: any, level?: number }) => {
    const [collapsed, setCollapsed] = useState(level > 2);
    
    if (data === null) return <span style={{ color: '#999' }}>null</span>;
    if (data === undefined) return <span style={{ color: '#999' }}>undefined</span>;
    if (typeof data === 'string') return <span style={{ color: '#22863a' }}>"{data}"</span>;
    if (typeof data === 'number') return <span style={{ color: '#005cc5' }}>{data}</span>;
    if (typeof data === 'boolean') return <span style={{ color: '#d73a49' }}>{String(data)}</span>;
    
    if (Array.isArray(data)) {
      if (data.length === 0) return <span>[]</span>;
      return (
        <div>
          <span 
            onClick={() => setCollapsed(!collapsed)} 
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            {collapsed ? '▶' : '▼'} [{data.length}]
          </span>
          {!collapsed && (
            <div style={{ marginLeft: '20px', borderLeft: '1px solid #ddd', paddingLeft: '10px' }}>
              {data.map((item, index) => (
                <div key={index}>
                  <span style={{ color: '#666' }}>{index}:</span> <JsonTree data={item} level={level + 1} />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    
    if (typeof data === 'object') {
      const keys = Object.keys(data);
      if (keys.length === 0) return <span>{'{}'}</span>;
      return (
        <div>
          <span 
            onClick={() => setCollapsed(!collapsed)} 
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            {collapsed ? '▶' : '▼'} {'{'}
          </span>
          {!collapsed && (
            <div style={{ marginLeft: '20px', borderLeft: '1px solid #ddd', paddingLeft: '10px' }}>
              {keys.map((key) => (
                <div key={key}>
                  <span style={{ color: '#032f62' }}>{key}:</span> <JsonTree data={data[key]} level={level + 1} />
                </div>
              ))}
            </div>
          )}
          {!collapsed && <span>{'}'}</span>}
        </div>
      );
    }
    
    return <span>{String(data)}</span>;
  };

  const mcpTools = [
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
                    title={isInitialized ? "MCP Tools" : "MCP Tools (waiting for initialization...)"}
                    style={{ 
                      backgroundColor: isInitialized ? '#1ABC9C' : '#95a5a6',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: isInitialized ? 'pointer' : 'not-allowed',
                      opacity: isInitialized ? 1 : 0.7
                    }}
                    disabled={!isInitialized}
                  >
                    🔧 MCP Tools {isInitialized ? '▼' : '⏳'}
                  </button>
                  {showMcpDropdown && isInitialized && (
                    <div className="mcp-tools-dropdown">
                      {mcpTools.map((tool) => (
                        <button
                          key={tool.name}
                          onClick={() => {
                            callMcpTool(tool.name, tool.params);
                            setShowMcpDropdown(false);
                          }}
                          className="mcp-tool-button"
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
        {mcpStatus && (
          <div style={{ 
            marginBottom: '10px', 
            padding: '8px 12px', 
            backgroundColor: mcpStatus.includes('failed') ? '#ffebee' : '#e8f5e8',
            color: mcpStatus.includes('failed') ? '#c62828' : '#2e7d32',
            borderRadius: '6px',
            fontSize: '13px',
            border: `1px solid ${mcpStatus.includes('failed') ? '#ffcdd2' : '#c8e6c9'}`,
            fontWeight: '500'
          }}>
            MCP: {mcpStatus}
          </div>
        )}
        <p>Document ID: {DOC_ID}</p>
        <p>Rich text features: Bold, Italic, Lists, Headings, etc.</p>
        
        {/* Document JSON Tree */}
        {showDocumentTree && (
          <div style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            maxHeight: '400px',
            overflowY: 'auto'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '10px',
              borderBottom: '1px solid #dee2e6',
              paddingBottom: '8px'
            }}>
              <div>
                <h4 style={{ margin: 0, color: '#495057' }}>Document Structure</h4>
                <small style={{ color: '#6c757d', fontSize: '11px' }}>
                  📡 Data source: MCP Server Local Model (not WebSocket)
                </small>
              </div>
              <div>
                <button
                  onClick={async () => {
                    try {
                      const result = await callMcpTool('get_document_info', { doc_id: DOC_ID });
                      if (result?.result?.content?.[0]?.text) {
                        const content = JSON.parse(result.result.content[0].text);
                        if (content.content) {
                          setDocumentContent(content.content);
                        }
                      }
                    } catch (error) {
                      console.error('Failed to refresh document content:', error);
                    }
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginRight: '8px'
                  }}
                >
                  🔄 Refresh
                </button>
                <button
                  onClick={() => setShowDocumentTree(!showDocumentTree)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {showDocumentTree ? '🔽 Hide' : '▶️ Show'}
                </button>
              </div>
            </div>
            {documentContent ? (
              <div style={{ 
                fontFamily: 'Monaco, "Lucida Console", monospace',
                fontSize: '12px',
                lineHeight: '1.4'
              }}>
                <JsonTree data={documentContent} />
              </div>
            ) : (
              <div style={{ 
                textAlign: 'center', 
                color: '#6c757d',
                fontStyle: 'italic',
                padding: '20px'
              }}>
                {isInitialized ? 'Click refresh to load document structure' : 'Waiting for initialization...'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
