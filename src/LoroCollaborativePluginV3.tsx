/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { createPortal } from 'react-dom';
import { 
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
} from 'lexical';
import { LoroDoc, type Cursor } from 'loro-crdt';
import { createLoroBinding, type LoroBinding } from './collaboration/LoroBinding';
import { initializeSyncHandlers } from './collaboration/sync/SyncLoroToLexical';

// Commands (matching YJS pattern)
const CONNECTED_COMMAND: LexicalCommand<boolean> = createCommand('LORO_CONNECTED_COMMAND');
const TOGGLE_CONNECT_COMMAND: LexicalCommand<boolean> = createCommand('LORO_TOGGLE_CONNECT_COMMAND');

// Types for peer information (following YJS UserState pattern)
export interface LoroUserState {
  anchorPos: Cursor | null;
  color: string;
  focusing: boolean;
  focusPos: Cursor | null;
  name: string;
  awarenessData: object;
  [key: string]: unknown;
}

export interface PeerInfo {
  id: string;
  clientId: string;
  displayId: string;
  isCurrentUser: boolean;
  isYou?: boolean;
}

// Provider interface (matching YJS Provider pattern)
export interface LoroProvider {
  doc: LoroDoc;
  connected: boolean;
  awareness: LoroAwareness;
  connect(): void | Promise<void>;
  disconnect(): void;
  on(type: 'sync', cb: (isSynced: boolean) => void): void;
  on(type: 'status', cb: (arg0: {status: string}) => void): void;
  on(type: 'update', cb: (arg0: unknown) => void): void;
  on(type: 'reload', cb: (doc: LoroDoc) => void): void;
  off(type: 'sync', cb: (isSynced: boolean) => void): void;
  off(type: 'status', cb: (arg0: {status: string}) => void): void;
  off(type: 'update', cb: (arg0: unknown) => void): void;
  off(type: 'reload', cb: (doc: LoroDoc) => void): void;
}

// Awareness interface (matching YJS Awareness pattern)
export interface LoroAwareness {
  getLocalState(): LoroUserState | null;
  getStates(): Map<string, LoroUserState>;
  setLocalState(state: LoroUserState): void;
  setLocalStateField(field: string, value: unknown): void;
  on(type: 'update', cb: () => void): void;
  off(type: 'update', cb: () => void): void;
}

// Plugin props (matching YJS CollaborationPlugin pattern)
interface LoroCollaborativePluginV3Props {
  id: string;
  docId: string;
  websocketUrl?: string;
  username?: string;
  cursorColor?: string;
  cursorsContainerRef?: React.MutableRefObject<HTMLElement | null>;
  shouldBootstrap?: boolean;
  awarenessData?: object;
  onConnectionChange?: (connected: boolean) => void;
  onInitialization?: (doc: LoroDoc) => void;
  onPeerIdChange?: (peerId: string) => void;
  onPeerCountChange?: (count: number) => void;
  onPeersChange?: (peers: Array<{ id: string; clientId: string; isYou?: boolean }>) => void;
}

/**
 * Loro Collaborative Plugin V3 - Following YJS Pattern
 * 
 * This plugin follows the exact structure of YJS CollaborationPlugin:
 * 1. Provider factory pattern for network abstraction
 * 2. Binding pattern for editor integration  
 * 3. Awareness pattern for user presence
 * 4. Cursor synchronization with relative positions
 * 5. Incremental sync with transaction-based updates
 */
export const LoroCollaborativePluginV3 = ({
  id,
  docId,
  websocketUrl = 'ws://localhost:8083',
  username,
  cursorColor,
  cursorsContainerRef,
  shouldBootstrap = true,
  awarenessData = {},
  onConnectionChange,
  onInitialization,
  onPeerIdChange,
  onPeerCountChange,
  onPeersChange,
}: LoroCollaborativePluginV3Props) => {
  const [editor] = useLexicalComposerContext();
  
  // State management (following YJS pattern)
  const [provider, setProvider] = useState<LoroProvider | null>(null);
  const [doc, setDoc] = useState<LoroDoc | null>(null);
  const [binding, setBinding] = useState<LoroBinding | null>(null);
  
  const isProviderInitialized = useRef(false);
  const isBindingInitialized = useRef(false);
  const isReloadingDoc = useRef(false);
  
  // Provider factory (following YJS providerFactory pattern)
  const providerFactory = useCallback((id: string, docMap: Map<string, LoroDoc>): LoroProvider => {
    console.log('🏭 Creating Loro provider for:', id);
    
    const loroDoc = new LoroDoc();
    docMap.set(id, loroDoc);
    
    // Create awareness implementation
    const awarenessStates = new Map<string, LoroUserState>();
    let localState: LoroUserState | null = null;
    const awarenessListeners: (() => void)[] = [];
    
    const awareness: LoroAwareness = {
      getLocalState: () => localState,
      getStates: () => new Map(awarenessStates),
      setLocalState: (state: LoroUserState) => {
        localState = state;
        awarenessStates.set(loroDoc.peerIdStr, state);
        awarenessListeners.forEach(cb => cb());
      },
      setLocalStateField: (field: string, value: unknown) => {
        if (localState) {
          localState[field] = value;
          awarenessStates.set(loroDoc.peerIdStr, localState);
          awarenessListeners.forEach(cb => cb());
        }
      },
      on: (type: 'update', cb: () => void) => {
        if (type === 'update') {
          awarenessListeners.push(cb);
        }
      },
      off: (type: 'update', cb: () => void) => {
        if (type === 'update') {
          const index = awarenessListeners.indexOf(cb);
          if (index > -1) {
            awarenessListeners.splice(index, 1);
          }
        }
      }
    };
    
    // Provider implementation
    const eventListeners = new Map<string, ((...args: any[]) => void)[]>();
    let websocket: WebSocket | null = null;
    let isConnecting = false;
    
    const provider: LoroProvider = {
      doc: loroDoc,
      connected: false,
      awareness,
      
      connect: async () => {
        if (isConnecting || websocket?.readyState === WebSocket.CONNECTING) {
          return;
        }
        
        isConnecting = true;
        const wsUrl = `${websocketUrl}/${docId}`;
        console.log('🔌 Loro provider connecting to:', wsUrl);
        
        websocket = new WebSocket(wsUrl);
        
        websocket.onopen = () => {
          console.log('✅ Loro provider connected');
          provider.connected = true;
          isConnecting = false;
          
          // Emit status event
          const statusListeners = eventListeners.get('status') || [];
          statusListeners.forEach(cb => cb({ status: 'connected' }));
          
          // Register Loro peer ID
          websocket?.send(JSON.stringify({
            type: 'registerLoroPeerId',
            docId: docId,
            loroPeerId: loroDoc.peerIdStr
          }));
          
          // Initial sync
          const syncListeners = eventListeners.get('sync') || [];
          syncListeners.forEach(cb => cb(true));
        };
        
        websocket.onclose = () => {
          console.log('❌ Loro provider disconnected');
          provider.connected = false;
          isConnecting = false;
          
          const statusListeners = eventListeners.get('status') || [];
          statusListeners.forEach(cb => cb({ status: 'disconnected' }));
        };
        
        websocket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('📨 Loro provider received:', message.type);
            
            if (message.type === 'update' && message.update) {
              // Handle Loro updates
              const updateBytes = Uint8Array.from(atob(message.update), c => c.charCodeAt(0));
              loroDoc.import(updateBytes);
              
              const updateListeners = eventListeners.get('update') || [];
              updateListeners.forEach(cb => cb(message));
            } else if (message.type === 'peerUpdate' && message.peers) {
              // Handle peer updates
              onPeersChange?.(message.peers);
              onPeerCountChange?.(message.peerCount || message.peers.length);
            }
          } catch (error) {
            console.error('❌ Provider message error:', error);
          }
        };
      },
      
      disconnect: () => {
        provider.connected = false;
        websocket?.close();
        websocket = null;
      },
      
      on: (type: string, cb: (...args: any[]) => void) => {
        if (!eventListeners.has(type)) {
          eventListeners.set(type, []);
        }
        eventListeners.get(type)!.push(cb);
      },
      
      off: (type: string, cb: (...args: any[]) => void) => {
        const listeners = eventListeners.get(type);
        if (listeners) {
          const index = listeners.indexOf(cb);
          if (index > -1) {
            listeners.splice(index, 1);
          }
        }
      }
    };
    
    return provider;
  }, [websocketUrl, docId, onPeersChange, onPeerCountChange]);
  
  // Doc map (following YJS pattern)
  const docMap = useMemo(() => new Map<string, LoroDoc>(), []);
  
  // Initialize provider (following YJS pattern)
  useEffect(() => {
    if (isProviderInitialized.current) {
      return;
    }
    
    isProviderInitialized.current = true;
    console.log('🚀 Initializing Loro provider');
    
    const newProvider = providerFactory(id, docMap);
    setProvider(newProvider);
    setDoc(docMap.get(id) || null);
    
    return () => {
      newProvider.disconnect();
    };
  }, [id, providerFactory, docMap]);
  
  // Initialize binding (following YJS pattern)
  useEffect(() => {
    if (!provider || isBindingInitialized.current) {
      return;
    }
    
    isBindingInitialized.current = true;
    console.log('🔗 Creating Loro binding');
    
    const newBinding = createLoroBinding(
      editor,
      provider,
      id,
      doc || docMap.get(id)!,
      docMap,
      new Map()
    );
    setBinding(newBinding);
    
    return () => {
      // Cleanup binding
      console.log('🧹 Cleaning up binding');
    };
  }, [editor, provider, id, docMap, doc]);
  
  // Initialize local awareness state (following YJS pattern)
  useEffect(() => {
    if (!provider) return;
    
    const randomEntry = [
      ['Cat', 'rgb(125, 50, 0)'],
      ['Dog', 'rgb(100, 0, 0)'],
      ['Rabbit', 'rgb(150, 0, 0)'],
      ['Frog', 'rgb(200, 0, 0)'],
      ['Fox', 'rgb(200, 75, 0)'],
    ][Math.floor(Math.random() * 5)];
    
    const name = username || randomEntry[0];
    const color = cursorColor || randomEntry[1];
    
    provider.awareness.setLocalState({
      anchorPos: null,
      color,
      focusPos: null,
      focusing: false,
      name,
      awarenessData: awarenessData || {},
    });
    
    onPeerIdChange?.(provider.doc.peerIdStr);
  }, [provider, username, cursorColor, awarenessData, onPeerIdChange]);
  
  // Sync handlers (following YJS pattern)
  useEffect(() => {
    if (!provider || !binding) return;
    
    console.log('🔄 Setting up sync handlers');
    
    const onStatus = ({ status }: { status: string }) => {
      const isConnected = status === 'connected';
      onConnectionChange?.(isConnected);
      editor.dispatchCommand(CONNECTED_COMMAND, isConnected);
    };
    
    const onSync = (isSynced: boolean) => {
      if (shouldBootstrap && isSynced && binding.root.isEmpty() && !isReloadingDoc.current) {
        // Initialize empty editor
        editor.update(() => {
          const root = editor.getEditorState()._nodeMap.get('root');
          if (root && (root as any).getChildrenSize() === 0) {
            console.log('📝 Bootstrapping empty editor');
            // Add initial content if needed
          }
        }, { tag: 'collaboration' });
      }
      isReloadingDoc.current = false;
      
      if (!isReloadingDoc.current) {
        onInitialization?.(provider.doc);
      }
    };
    
    const onAwarenessUpdate = () => {
      // Sync cursor positions
      console.log('👥 Awareness updated');
    };
    
    const onUpdate = () => {
      // Handle document updates
      console.log('🔄 Document updated');
    };
    
    // Register event listeners
    provider.on('status', onStatus);
    provider.on('sync', onSync);
    provider.on('update', onUpdate);
    provider.awareness.on('update', onAwarenessUpdate);
    
    // Initialize sync
    const syncCleanup = initializeSyncHandlers(binding);
    
    // Connect provider
    provider.connect();
    
    return () => {
      provider.off('status', onStatus);
      provider.off('sync', onSync);
      provider.off('update', onUpdate);
      provider.awareness.off('update', onAwarenessUpdate);
      syncCleanup();
    };
  }, [provider, binding, editor, shouldBootstrap, onConnectionChange, onInitialization]);
  
  // Command handlers (following YJS pattern)
  useEffect(() => {
    return editor.registerCommand(
      TOGGLE_CONNECT_COMMAND,
      (shouldConnect: boolean) => {
        if (provider) {
          if (shouldConnect) {
            console.log('🔌 Collaboration connected!');
            provider.connect();
          } else {
            console.log('❌ Collaboration disconnected!');
            provider.disconnect();
          }
        }
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [provider, editor]);
  
  // Cursors container (following YJS pattern)
  const cursorsContainer = useMemo(() => {
    if (!binding) return null;
    
    const ref = (element: HTMLElement | null) => {
      binding.cursorsContainer = element;
    };
    
    return createPortal(
      <div ref={ref} />,
      (cursorsContainerRef && cursorsContainerRef.current) || document.body,
    );
  }, [binding, cursorsContainerRef]);
  
  // Focus tracking (following YJS pattern)
  useEffect(() => {
    if (!provider) return;
    
    const onFocus = () => {
      const localState = provider.awareness.getLocalState();
      if (localState) {
        provider.awareness.setLocalStateField('focusing', true);
      }
    };
    
    const onBlur = () => {
      const localState = provider.awareness.getLocalState();
      if (localState) {
        provider.awareness.setLocalStateField('focusing', false);
      }
    };
    
    const removeListeners = [
      editor.registerCommand(
        createCommand('FOCUS_COMMAND'),
        () => {
          onFocus();
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        createCommand('BLUR_COMMAND'),
        () => {
          onBlur();
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    ];
    
    return () => {
      removeListeners.forEach(remove => remove());
    };
  }, [provider, editor]);
  
  return cursorsContainer;
};

export default LoroCollaborativePluginV3;
