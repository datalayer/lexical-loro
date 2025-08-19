import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LoroDoc, LoroMap } from 'loro-crdt';
import './CollaborativeEditor.css';

interface CollaborativeEditorProps {
  websocketUrl?: string;
  onConnectionChange?: (connected: boolean) => void;
}

export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
  websocketUrl = 'ws://localhost:8081',
  onConnectionChange
}) => {
  const [text, setText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const docRef = useRef<LoroDoc>(new LoroDoc());
  const mapRef = useRef<LoroMap | null>(null);
  const isLocalChange = useRef(false);
  const hasReceivedInitialSnapshot = useRef(false);
  const isConnectingRef = useRef(false);

  // Initialize Loro document and text object
  useEffect(() => {
  const doc = docRef.current;
  mapRef.current = doc.getMap('shared-text');
    
    // Subscribe to document changes
    const unsubscribe = doc.subscribe(() => {
      if (!isLocalChange.current) {
        // This is a remote change, update the UI
        try {
          const obj = mapRef.current?.get('text');
          setText(typeof obj === 'string' ? obj : '');
        } catch {
          setText('');
        }
      }
      isLocalChange.current = false;
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // WebSocket connection management
  useEffect(() => {
    const connectWebSocket = () => {
      // Prevent multiple simultaneous connection attempts
      if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }
      
      isConnectingRef.current = true;
      
      try {
        const ws = new WebSocket(websocketUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          isConnectingRef.current = false;
          setIsConnected(true);
          setError(null);
          onConnectionChange?.(true);
          console.log('Connected to WebSocket server');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'loro-update') {
              // Apply remote update to local document (hex or array)
              let update: Uint8Array | null = null;
              if (data.updateHex) {
                const hex: string = data.updateHex as string;
                const len = hex.length / 2;
                const buf = new Uint8Array(len);
                for (let i = 0; i < len; i++) buf[i] = parseInt(hex.substr(i * 2, 2), 16);
                update = buf;
              } else if (data.update) {
                update = new Uint8Array(data.update);
              }
              if (update) {
                docRef.current.import(update);
              }
            } else if (data.type === 'initial-snapshot') {
              // Apply initial snapshot from server (hex or array)
              let snapshot: Uint8Array | null = null;
              if (data.snapshotHex) {
                const hex: string = data.snapshotHex as string;
                const len = hex.length / 2;
                const buf = new Uint8Array(len);
                for (let i = 0; i < len; i++) buf[i] = parseInt(hex.substr(i * 2, 2), 16);
                snapshot = buf;
              } else if (data.snapshot) {
                snapshot = new Uint8Array(data.snapshot);
              }
              if (snapshot) {
                docRef.current.import(snapshot);
              }
              hasReceivedInitialSnapshot.current = true;
              console.log('📄 Received and applied initial snapshot');
            } else if (data.type === 'welcome') {
              console.log('👋 Welcome message received:', data.message);
              
              // Request current snapshot from server after a small delay
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'request-snapshot',
                    docId: 'shared-text'
                  }));
                  console.log('📞 Requested current snapshot from server');
                }
              }, 100);
            } else if (data.type === 'snapshot-request') {
              // Another client is requesting a snapshot, send ours if we have content
              const current = mapRef.current?.get('text');
              if (typeof current === 'string' && current.length > 0) {
                const snapshot = docRef.current.exportSnapshot();
                ws.send(JSON.stringify({
                  type: 'snapshot',
                  snapshot: Array.from(snapshot),
                  docId: 'shared-text'
                }));
                console.log('📄 Sent snapshot in response to request');
              }
            }
          } catch (err) {
            console.error('Error processing WebSocket message:', err);
          }
        };

        ws.onclose = () => {
          isConnectingRef.current = false;
          setIsConnected(false);
          onConnectionChange?.(false);
          console.log('Disconnected from WebSocket server');
          
          // Attempt to reconnect after 3 seconds
          setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (err) => {
          isConnectingRef.current = false;
          setError('WebSocket connection error');
          console.error('WebSocket error:', err);
        };

      } catch (err) {
        isConnectingRef.current = false;
        setError('Failed to connect to WebSocket server');
        console.error('WebSocket connection failed:', err);
      }
    };

    connectWebSocket();

    return () => {
      isConnectingRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websocketUrl]); // Intentionally exclude onConnectionChange to avoid reconnect loops

  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = event.target.value;
    isLocalChange.current = true;
    try {
      mapRef.current?.set('text', newText);
    } catch (e) {
      console.warn('Failed to set text in Map:', e);
    }
    setText(newText);
    
    // Send update to WebSocket server
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const update = docRef.current.exportFrom();
      const updateHex = Array.from(update).map(b => b.toString(16).padStart(2, '0')).join('');
      wsRef.current.send(JSON.stringify({
        type: 'loro-update',
        updateHex,
        docId: 'shared-text'
      }));

      // Also send a snapshot every 10 changes to keep server state updated
      if (Math.random() < 0.1) { // 10% chance to send snapshot
        const snapshot = docRef.current.exportSnapshot();
        const snapshotHex = Array.from(snapshot).map(b => b.toString(16).padStart(2, '0')).join('');
        wsRef.current.send(JSON.stringify({
          type: 'snapshot',
          snapshotHex,
          docId: 'shared-text'
        }));
      }
    }
  }, []);

  // Diff helpers removed with Map-only syncing

  // Disconnect function
  const handleDisconnect = useCallback(() => {
    if (wsRef.current) {
      isConnectingRef.current = false;
      wsRef.current.close();
      setIsConnected(false);
      onConnectionChange?.(false);
    }
  }, [onConnectionChange]);

  return (
    <div className="collaborative-editor">
      <div className="editor-header">
        <h2>Collaborative Text Editor</h2>
        <div className="connection-status">
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
          {isConnected && (
            <button 
              onClick={handleDisconnect}
              className="disconnect-button"
              title="Disconnect from server"
            >
              🔌 Disconnect
            </button>
          )}
          {error && <span className="error-message">{error}</span>}
        </div>
      </div>
      
      <div className="editor-container">
        <textarea
          value={text}
          onChange={handleTextChange}
          placeholder="Start typing... Your changes will be shared in real-time!"
          className="editor-textarea"
          rows={20}
          cols={80}
        />
      </div>
      
      <div className="editor-info">
        <p>WebSocket URL: {websocketUrl}</p>
        <p>Document ID: shared-text</p>
        <p>Characters: {text.length}</p>
      </div>
    </div>
  );
};
