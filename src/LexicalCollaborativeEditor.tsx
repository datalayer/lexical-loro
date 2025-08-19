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
import { LoroCollaborativePlugin0 } from './LoroCollaborativePlugin0';
import { LoroCollaborativePlugin1 } from './LoroCollaborativePlugin1';
import { LoroCollaborativePlugin2 } from './LoroCollaborativePlugin2';
import { LoroCollaborativePlugin3 } from './LoroCollaborativePlugin3';
import { LoroCollaborativePlugin4 } from './LoroCollaborativePlugin4';
import { LoroCollaborativePlugin5 } from './LoroCollaborativePlugin5';
import { LexicalToolbar } from './LexicalToolbar';
import { CounterNode } from './CounterNode';

interface LexicalCollaborativeEditorProps {
  websocketUrl: string;
  onConnectionChange?: (connected: boolean) => void;
}

const theme = {
  // Theme styling for Lexical
  ltr: 'ltr',
  rtl: 'rtl',
  placeholder: 'editor-placeholder',
  paragraph: 'editor-paragraph',
  quote: 'editor-quote',
  heading: {
    h1: 'editor-heading-h1',
    h2: 'editor-heading-h2',
    h3: 'editor-heading-h3',
    h4: 'editor-heading-h4',
    h5: 'editor-heading-h5',
  },
  list: {
    nested: {
      listitem: 'editor-nested-listitem',
    },
    ol: 'editor-list-ol',
    ul: 'editor-list-ul',
    listitem: 'editor-listitem',
  },
  image: 'editor-image',
  link: 'editor-link',
  text: {
    bold: 'editor-text-bold',
    italic: 'editor-text-italic',
    overflowed: 'editor-text-overflowed',
    hashtag: 'editor-text-hashtag',
    underline: 'editor-text-underline',
    strikethrough: 'editor-text-strikethrough',
    underlineStrikethrough: 'editor-text-underlineStrikethrough',
    code: 'editor-text-code',
  },
  code: 'editor-code',
  codeHighlight: {
    atrule: 'editor-tokenAttr',
    attr: 'editor-tokenAttr',
    boolean: 'editor-tokenProperty',
    builtin: 'editor-tokenSelector',
    cdata: 'editor-tokenComment',
    char: 'editor-tokenSelector',
    class: 'editor-tokenFunction',
    'class-name': 'editor-tokenFunction',
    comment: 'editor-tokenComment',
    constant: 'editor-tokenProperty',
    deleted: 'editor-tokenProperty',
    doctype: 'editor-tokenComment',
    entity: 'editor-tokenOperator',
    function: 'editor-tokenFunction',
    important: 'editor-tokenVariable',
    inserted: 'editor-tokenSelector',
    keyword: 'editor-tokenAttr',
    namespace: 'editor-tokenVariable',
    number: 'editor-tokenProperty',
    operator: 'editor-tokenOperator',
    prolog: 'editor-tokenComment',
    property: 'editor-tokenProperty',
    punctuation: 'editor-tokenPunctuation',
    regex: 'editor-tokenVariable',
    selector: 'editor-tokenSelector',
    string: 'editor-tokenSelector',
    symbol: 'editor-tokenProperty',
    tag: 'editor-tokenProperty',
    url: 'editor-tokenOperator',
    variable: 'editor-tokenVariable',
  },
};

// Catch any errors that occur during Lexical updates and log them
// or throw them as needed.
function onError(error: Error) {
  console.error('Lexical error:', error);
}

export const LexicalCollaborativeEditor: React.FC<LexicalCollaborativeEditorProps> = ({
  websocketUrl,
  onConnectionChange
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [peerId, setPeerId] = useState<string>('');
  const [awarenessData, setAwarenessData] = useState<Array<{peerId: string, userName: string, isCurrentUser?: boolean}>>([]);
  const [pluginVersion, setPluginVersion] = useState<'v0' | 'v1' | 'v2' | 'v3' | 'v4' | 'v5'>('v0'); // Add v0 option
  const disconnectRef = useRef<(() => void) | null>(null);

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
  const initialConfig = {
    namespace: 'LexicalCollaborativeEditor',
    theme,
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
        <div className="plugin-selector" style={{ margin: '10px 0', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
          <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>Plugin Version:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="radio"
                name="pluginVersion"
                value="v0"
                checked={pluginVersion === 'v0'}
                onChange={(e) => setPluginVersion(e.target.value as 'v0' | 'v1' | 'v2' | 'v3' | 'v4' | 'v5')}
                disabled={isConnected}
              />
              <span>v0 - 🧩 Minimal LoroMap + WebSocket (no editor sync, just logs)</span>
            </label>
            {/*
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="radio"
                name="pluginVersion"
                value="v1"
                checked={pluginVersion === 'v1'}
                onChange={(e) => setPluginVersion(e.target.value as 'v0' | 'v1' | 'v2' | 'v3' | 'v4' | 'v5')}
                disabled={isConnected}
              />
              <span>v1 - Original Complex Plugin (2,938 lines, JSON + cursors)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="radio"
                name="pluginVersion"
                value="v2"
                checked={pluginVersion === 'v2'}
                onChange={(e) => setPluginVersion(e.target.value as 'v1' | 'v2' | 'v3' | 'v4' | 'v5')}
                disabled={isConnected}
              />
              <span>v2 - Clean JSON Plugin (306 lines, still JSON-based)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="radio"
                name="pluginVersion"
                value="v3"
                checked={pluginVersion === 'v3'}
                onChange={(e) => setPluginVersion(e.target.value as 'v1' | 'v2' | 'v3' | 'v4' | 'v5')}
                disabled={isConnected}
              />
              <span>v3 - ✨ Minimal Text Plugin (text-only, character-level diffs)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="radio"
                name="pluginVersion"
                value="v4"
                checked={pluginVersion === 'v4'}
                onChange={(e) => setPluginVersion(e.target.value as 'v1' | 'v2' | 'v3' | 'v4' | 'v5')}
                disabled={isConnected}
              />
              <span>v4 - 🎯 Smart Hybrid Plugin (rich formatting + minimal updates)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="radio"
                name="pluginVersion"
                value="v5"
                checked={pluginVersion === 'v5'}
                onChange={(e) => setPluginVersion(e.target.value as 'v1' | 'v2' | 'v3' | 'v4' | 'v5')}
                disabled={isConnected}
              />
              <span>v5 - 🚀 State-Based Plugin (Lexical update listener + Loro diffing)</span>
            </label>
            */}
          </div>
          {isConnected && <div style={{ color: '#888', fontSize: '12px', marginTop: '8px' }}>Cannot change while connected</div>}
          <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
            {pluginVersion === 'v0' && "🧩 Minimal LoroMap + WebSocket (no editor sync, just logs)"}
            {pluginVersion === 'v1' && "🔄 Original complex plugin with text diffing and cursor management"}
            {pluginVersion === 'v2' && "🆕 Clean JSON-based plugin (still stores full editor state)"}
            {pluginVersion === 'v3' && "⚡ Text-only plugin with minimal character-level diffs (most efficient)"}
            {pluginVersion === 'v4' && "🎯 Smart hybrid plugin with rich formatting preserved and minimal updates"}
            {pluginVersion === 'v5' && "🚀 Content-agnostic state-based plugin using Lexical update listener and Loro diffing"}
          </div>
        </div>
        <div className="lexical-editor-info">
          <div className="connection-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
            {peerId && (
              <span className="peer-id-display" style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
                Peer ID: {peerId}
              </span>
            )}
            {pluginVersion === 'v1' && awarenessData.length > 0 && (
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
              <button 
                onClick={handleDisconnect}
                className="disconnect-button"
                title="Disconnect from server"
              >
                🔌 Disconnect
              </button>
            )}
          </div>
          <span>Powered by Lexical + Loro CRDT</span>
        </div>
      </div>
      
      <LexicalComposer initialConfig={initialConfig} key={pluginVersion}>
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
          
          {pluginVersion === 'v0' && (
            <LoroCollaborativePlugin0
              websocketUrl={websocketUrl}
              docId="lexical-shared-doc-v0"
              onConnectionChange={handleConnectionChange}
            />
          )}
          {pluginVersion === 'v1' && (
            <LoroCollaborativePlugin1
              websocketUrl={websocketUrl} 
              docId="lexical-shared-doc-v1" 
              onConnectionChange={handleConnectionChange}
              onPeerIdChange={setPeerId}
              onAwarenessChange={setAwarenessData}
              onDisconnectReady={(disconnectFn) => {
                disconnectRef.current = disconnectFn;
              }}
            />
          )}
          
          {pluginVersion === 'v2' && (
            <LoroCollaborativePlugin2 
              websocketUrl={websocketUrl} 
              docId="lexical-shared-doc-v2" 
              onConnectionChange={handleConnectionChange}
              onPeerIdChange={setPeerId}
            />
          )}
          
          {pluginVersion === 'v3' && (
            <LoroCollaborativePlugin3 
              websocketUrl={websocketUrl} 
              docId="lexical-shared-doc-v3" 
              onConnectionChange={handleConnectionChange}
              onPeerIdChange={setPeerId}
            />
          )}

          {pluginVersion === 'v4' && (
            <LoroCollaborativePlugin4 
              websocketUrl={websocketUrl} 
              docId="lexical-shared-doc-v4" 
              onConnectionChange={handleConnectionChange}
              onPeerIdChange={setPeerId}
            />
          )}

          {pluginVersion === 'v5' && (
            <LoroCollaborativePlugin5 
              websocketUrl={websocketUrl} 
              docId="lexical-shared-doc-v5" 
              onConnectionChange={handleConnectionChange}
              onPeerIdChange={setPeerId}
            />
          )}
        </div>
      </LexicalComposer>
      
      <div className="lexical-editor-footer">
        <p>Document ID: {
          pluginVersion === 'v0' ? 'lexical-shared-doc-v0' :
          pluginVersion === 'v1' ? 'lexical-shared-doc' :
          pluginVersion === 'v2' ? 'lexical-shared-doc-v2' :
          pluginVersion === 'v3' ? 'lexical-shared-doc-v3' :
          pluginVersion === 'v4' ? 'lexical-shared-doc-v4' :
          'lexical-shared-doc-v5'
        }</p>
        <p>Rich text features: Bold, Italic, Lists, Headings, etc.</p>
        {pluginVersion === 'v2' && (
          <p style={{ color: '#007acc', fontWeight: 'bold' }}>
            🆕 Using clean JSON plugin - simpler than v1, but still JSON-based
          </p>
        )}
        {pluginVersion === 'v3' && (
          <p style={{ color: '#00aa00', fontWeight: 'bold' }}>
            ⚡ Using text-only plugin - minimal character-level diffs for maximum efficiency
          </p>
        )}
        {pluginVersion === 'v4' && (
          <p style={{ color: '#ff6600', fontWeight: 'bold' }}>
            🎯 Using smart hybrid plugin - rich formatting preserved with intelligent minimal updates
          </p>
        )}
      </div>
    </div>
  );
};
