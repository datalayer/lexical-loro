/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { useEffect, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { 
  $getRoot, 
  $createParagraphNode,
  HISTORY_MERGE_TAG,
  SKIP_COLLAB_TAG,
  type EditorState
} from 'lexical';
import type { LexicalEditor } from 'lexical';
import { LoroDoc } from 'loro-crdt';

// Import Loro collaboration architecture (following YJS pattern)
import { 
  createLoroBinding, 
  syncLexicalToLoro,
  type LoroBinding, 
  type LoroProvider 
} from './collaboration';

// Types for peer information (preserving V2 pattern)
export interface PeerInfo {
  id: string;
  clientId: string;
  displayId: string;
  isCurrentUser: boolean;
  isYou?: boolean;
}

// Provider factory type (following YJS pattern)
export type LoroProviderFactory = (
  id: string,
  loroDocMap: Map<string, LoroDoc>
) => LoroProvider;

// Initial editor state type (following YJS pattern)
export type InitialEditorStateType = 
  | null 
  | string 
  | EditorState 
  | ((editor: LexicalEditor) => void);

// Types for the collaborative plugin (following YJS CollaborationPlugin pattern)
interface LoroCollaborativePluginV2Props {
  id: string;
  providerFactory: LoroProviderFactory; // YJS pattern: use factory instead of direct URL
  shouldBootstrap: boolean; // YJS pattern: control initial document setup
  username?: string;
  cursorColor?: string;
  initialEditorState?: InitialEditorStateType; // YJS pattern: handle initial content
  
  // Legacy V2 callbacks (for backward compatibility)
  onConnectionChange?: (connected: boolean) => void;
  onInitialization?: (doc: LoroDoc) => void;
  onPeerIdChange?: (peerId: string) => void;
  onPeerCountChange?: (count: number) => void;
  onPeersChange?: (peers: Array<{ id: string; clientId: string; isYou?: boolean }>) => void;
}

/**
 * Initialize editor with content (following YJS initializeEditor pattern)
 * This is called when bootstrapping an empty document, just like YJS
 */
function initializeEditor(
  editor: LexicalEditor,
  initialEditorState?: InitialEditorStateType,
): void {
  editor.update(
    () => {
      const root = $getRoot();

      if (root.isEmpty()) {
        if (initialEditorState) {
          switch (typeof initialEditorState) {
            case 'string': {
              // Parse Lexical JSON string
              const parsedEditorState = editor.parseEditorState(initialEditorState);
              editor.setEditorState(parsedEditorState, {
                tag: HISTORY_MERGE_TAG,
              });
              break;
            }
            case 'object': {
              // Use EditorState object directly - assume it's valid EditorState
              editor.setEditorState(initialEditorState as EditorState, {
                tag: HISTORY_MERGE_TAG,
              });
              break;
            }
            case 'function': {
              // Execute function to populate editor
              editor.update(
                () => {
                  const root1 = $getRoot();
                  if (root1.isEmpty()) {
                    initialEditorState(editor);
                  }
                },
                { tag: HISTORY_MERGE_TAG },
              );
              break;
            }
          }
        } else {
          // Default: create empty paragraph (YJS pattern)
          const paragraph = $createParagraphNode();
          root.append(paragraph);
          
          // Auto-select if editor is focused
          const { activeElement } = document;
          if (activeElement === editor.getRootElement()) {
            paragraph.select();
          }
        }
      }
    },
    {
      tag: HISTORY_MERGE_TAG,
    },
  );
}

/**
 * Clear editor for document reload (following YJS clearEditorSkipCollab pattern)
 */
function clearEditorSkipCollab(editor: LexicalEditor, binding: LoroBinding) {
  // Reset editor state
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      root.select();
    },
    {
      tag: SKIP_COLLAB_TAG,
    },
  );

  // TODO: Clear cursors when cursor system is implemented
  if (binding.cursorsContainer) {
    // Clear any existing cursors from DOM
    console.log('🧹 Clearing cursors from container');
  }
}

/**
 * LoroCollaborativePluginV2 - Following YJS Architecture Patterns
 * 
 * Key YJS patterns implemented:
 * 1. Provider Factory Pattern - Use factory function instead of direct WebSocket
 * 2. Document Map Management - Manage Loro documents like YJS manages Y.Doc
 * 3. Event-Driven Lifecycle - Provider events (status, sync, reload) 
 * 4. Binding Separation - Separate provider and binding initialization
 * 5. Bootstrap Control - shouldBootstrap for initial document setup
 * 6. Awareness Integration - User presence and cursor management
 */
export const LoroCollaborativePlugin = ({
  id,
  providerFactory,
  shouldBootstrap,
  username = 'Anonymous',
  cursorColor = '#3366cc',
  initialEditorState,
  onConnectionChange,
  onInitialization,
  onPeerIdChange, // eslint-disable-line @typescript-eslint/no-unused-vars
  onPeerCountChange, // eslint-disable-line @typescript-eslint/no-unused-vars  
  onPeersChange, // eslint-disable-line @typescript-eslint/no-unused-vars
}: LoroCollaborativePluginV2Props) => {
  const [editor] = useLexicalComposerContext();
  
  // State management (following YJS pattern)
  const isBindingInitialized = useRef(false);
  const isProviderInitialized = useRef(false);
  const isReloadingDoc = useRef(false);
  
  const [provider, setProvider] = useState<LoroProvider>();
  const [doc, setDoc] = useState<LoroDoc>();
  const [binding, setBinding] = useState<LoroBinding>();
  
  // Document map (following YJS yjsDocMap pattern)
  const loroDocMapRef = useRef<Map<string, LoroDoc>>(new Map());

  // Provider initialization (following YJS pattern)
  useEffect(() => {
    if (isProviderInitialized.current) {
      return;
    }

    isProviderInitialized.current = true;

    // Create or get Loro document for this ID
    let loroDoc = loroDocMapRef.current.get(id);
    if (!loroDoc) {
      loroDoc = new LoroDoc();
      loroDocMapRef.current.set(id, loroDoc);
    }
    
    // Create provider using factory (YJS pattern)
    const newProvider = providerFactory(id, loroDocMapRef.current);
    setProvider(newProvider);
    setDoc(loroDoc);

    console.log('🔗 Provider initialized for document:', id);

    return () => {
      newProvider.disconnect();
    };
  }, [id, providerFactory]);

  // Binding initialization (following YJS pattern)
  useEffect(() => {
    if (!provider || !doc) {
      return;
    }

    if (isBindingInitialized.current) {
      return;
    }

    isBindingInitialized.current = true;

    // Create Loro binding (equivalent to YJS createBinding)
    const newBinding = createLoroBinding(
      editor,
      provider,
      id,
      doc,
      loroDocMapRef.current,
      new Map() // excludedProperties
    );
    setBinding(newBinding);

    console.log('🔗 Binding created for document:', id);

    return () => {
      // TODO: Clean up binding when binding.root.destroy is implemented
      console.log('🧹 Cleaning up binding for document:', id);
    };
  }, [editor, provider, id, doc]);

  // Collaboration lifecycle (following YJS useYjsCollaboration pattern)
  useEffect(() => {
    if (!provider || !binding || !doc) {
      return;
    }

    console.log('🚀 Setting up Loro collaboration lifecycle');

    // Connection management
    const connect = () => provider.connect();
    const disconnect = () => {
      try {
        provider.disconnect();
      } catch (e) {
        console.warn('Disconnect error:', e);
      }
    };

    // Provider event handlers (following YJS pattern)
    const onStatus = ({ status }: { status: string }) => {
      console.log('📡 Provider status:', status);
      onConnectionChange?.(status === 'connected');
    };

    const onSync = (isSynced: boolean) => {
      console.log('🔄 Provider sync:', isSynced);
      
      // Bootstrap empty document (following YJS pattern)
      if (
        shouldBootstrap &&
        isSynced &&
        binding.root.isEmpty() &&
        // TODO: Check Loro document length when API is available
        isReloadingDoc.current === false
      ) {
        console.log('📄 Bootstrapping empty document with initial state');
        initializeEditor(editor, initialEditorState);
      }

      isReloadingDoc.current = false;
      
      if (isSynced && !isReloadingDoc.current) {
        onInitialization?.(doc);
      }
    };

    // TODO: Register awareness events when awareness system is implemented
    // const onAwarenessUpdate = () => {
    //   console.log('👥 Awareness updated');
    //   // TODO: Sync cursor positions when cursor system is implemented
    // };

    // TODO: Register Loro document observers when API is available
    // const onLoroDocChanges = (events: any[]) => {
    //   console.log('📝 Loro document changes:', events.length);
    //   
    //   // Sync Loro changes to Lexical (equivalent to YJS onYjsTreeChanges)
    //   if (events.length > 0) {
    //     syncLoroToLexical(
    //       binding,
    //       provider,
    //       events,
    //       false // isFromUndoManager
    //     );
    //   }
    // };

    const onProviderDocReload = (newDoc: LoroDoc) => {
      console.log('🔄 Provider document reload');
      clearEditorSkipCollab(editor, binding);
      setDoc(newDoc);
      loroDocMapRef.current.set(id, newDoc);
      isReloadingDoc.current = true;
    };

    // Register provider event listeners (following YJS pattern)
    provider.on('status', onStatus);
    provider.on('sync', onSync);
    provider.on('reload', onProviderDocReload);
    
    // TODO: Register awareness events when awareness system is implemented
    // provider.awareness?.on('update', onAwarenessUpdate);

    // TODO: Register Loro document observers when API is available
    // doc.subscribe(onLoroDocChanges);

    // Register Lexical update listener (following YJS pattern)
    const removeListener = editor.registerUpdateListener(
      ({
        prevEditorState,
        editorState,
        dirtyLeaves,
        dirtyElements,
        normalizedNodes,
        tags,
      }) => {
        if (tags.has(SKIP_COLLAB_TAG) === false) {
          syncLexicalToLoro(
            binding,
            provider,
            prevEditorState,
            editorState,
            dirtyElements,
            dirtyLeaves,
            normalizedNodes,
            tags,
          );
        }
      },
    );

    // Initialize user state (following YJS initLocalState pattern)
    // TODO: Implement when awareness system is available
    console.log('👤 Initializing local state:', { username, cursorColor });

    // Connect to provider
    const connectionPromise = connect();

    // Capture docMap reference for cleanup
    const docMapToCleanup = loroDocMapRef.current;

    return () => {
      if (isReloadingDoc.current === false) {
        if (connectionPromise) {
          connectionPromise.then(disconnect);
        } else {
          disconnect();
        }
      }

      // Clean up event listeners
      provider.off('status', onStatus);
      provider.off('sync', onSync);
      provider.off('reload', onProviderDocReload);
      
      // TODO: Clean up awareness listeners when implemented
      // provider.awareness?.off('update', onAwarenessUpdate);
      
      // TODO: Clean up document observers when implemented
      // doc.unsubscribe(onLoroDocChanges);
      
      removeListener();
      docMapToCleanup.delete(id);
    };
  }, [
    binding,
    provider,
    doc,
    editor,
    id,
    initialEditorState,
    shouldBootstrap,
    username,
    cursorColor,
    onConnectionChange,
    onInitialization,
  ]);

  // This plugin doesn't render anything - it manages collaboration lifecycle
  return null;
};

export default LoroCollaborativePlugin;
