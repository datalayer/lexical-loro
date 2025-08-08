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
import { LoroCollaborativePlugin } from './LoroCollaborativePlugin';
import { LexicalToolbar } from './LexicalToolbar';

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
            docId="lexical-shared-doc" 
            onConnectionChange={handleConnectionChange}
            onPeerIdChange={setPeerId}
            onAwarenessChange={setAwarenessData}
            onDisconnectReady={(disconnectFn) => {
              disconnectRef.current = disconnectFn;
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
