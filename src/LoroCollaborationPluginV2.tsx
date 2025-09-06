/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { JSX } from 'react';
import type { LoroDoc } from 'loro-crdt';

import {
  type LoroCollaborationContextType,
  useLoroCollaborationContext,
} from './LoroCollaborationContext';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  type LoroBinding,
  createLoroBinding,
  type LoroProvider,
} from './collaboration';
import type { EditorState, LexicalEditor } from 'lexical';
import { useEffect, useRef, useState } from 'react';

import {
  type LoroCursorsContainerRef,
  useLoroCollaboration,
  useLoroFocusTracking,
  useLoroHistory,
  type SyncLoroCursorPositionsFn,
} from './useLoroCollaboration';

// Initial editor state type (following YJS pattern)
export type InitialEditorStateType = 
  | null 
  | string 
  | EditorState 
  | ((editor: LexicalEditor) => void);


type ILoroCollaborationPluginPropsV2 = {
  id: string;
  providerFactory: (
    id: string,
    loroDocMap: Map<string, LoroDoc>,
  ) => LoroProvider;
  shouldBootstrap: boolean;
  username?: string;
  cursorColor?: string;
  cursorsContainerRef?: LoroCursorsContainerRef;
  initialEditorState?: InitialEditorStateType;
  excludedProperties?: Map<any, Set<string>>;
  // `awarenessData` parameter allows arbitrary data to be added to the awareness.
  awarenessData?: object;
  syncCursorPositionsFn?: SyncLoroCursorPositionsFn;
  // Callback props for peer management
  onPeerIdChange?: (peerId: string) => void;
  onAwarenessChange?: (awareness: Array<{peerId: string, userName: string, isCurrentUser?: boolean}>) => void;
};

/**
 * LoroCollaborationPlugin - Following YJS CollaborationPlugin pattern exactly
 * 
 * This plugin provides the main collaboration interface following the exact
 * same architecture as YJS CollaborationPlugin:
 * 
 * Key responsibilities:
 * 1. Context management - Get collaboration context (loroDocMap, name, color)
 * 2. Provider initialization - Create provider using factory with loroDocMap
 * 3. Binding creation - Create binding between editor and Loro document
 * 4. Lifecycle management - Set isCollabActive flag, clientID assignment
 * 5. Component orchestration - Pass everything to LoroCollaborationCursors
 */
export function LoroCollaborationPluginV2({
  id,
  providerFactory,
  shouldBootstrap,
  username,
  cursorColor,
  cursorsContainerRef,
  initialEditorState,
  excludedProperties,
  awarenessData,
  syncCursorPositionsFn,
  onPeerIdChange,
  onAwarenessChange,
}: ILoroCollaborationPluginPropsV2): JSX.Element {
  const isBindingInitialized = useRef(false);
  const isProviderInitialized = useRef(false);

  // Get collaboration context (following YJS pattern exactly)
  const collabContext = useLoroCollaborationContext(username, cursorColor);

  // Extract values from context (following YJS pattern)
  const { loroDocMap, name, color } = collabContext;

  const [editor] = useLexicalComposerContext();

  // Set collaboration active state (following YJS pattern exactly)
  useEffect(() => {
    collabContext.isCollabActive = true;

    return () => {
      // Resetting flag only when unmount top level editor collab plugin. Nested
      // editors (e.g. image caption) should unmount without affecting it
      if (editor._parentEditor == null) {
        collabContext.isCollabActive = false;
      }
    };
  }, [collabContext, editor]);

  const [provider, setProvider] = useState<LoroProvider>();
  const [doc, setDoc] = useState<LoroDoc>();

  // Provider initialization (following YJS pattern exactly)
  useEffect(() => {
    if (isProviderInitialized.current) {
      return;
    }

    isProviderInitialized.current = true;

    // Create provider using factory with loroDocMap (following YJS pattern)
    const newProvider = providerFactory(id, loroDocMap);
    setProvider(newProvider);
    setDoc(loroDocMap.get(id));

    return () => {
      newProvider.disconnect();
    };
  }, [id, providerFactory, loroDocMap]);

  const [binding, setBinding] = useState<LoroBinding>();

  // Binding initialization (following YJS pattern exactly)
  useEffect(() => {
    if (!provider) {
      return;
    }

    if (isBindingInitialized.current) {
      return;
    }

    isBindingInitialized.current = true;

    // Create binding (following YJS pattern)
    const newBinding = createLoroBinding(
      editor,
      provider,
      id,
      doc || loroDocMap.get(id)!,
      loroDocMap,
      excludedProperties,
    );
    setBinding(newBinding);

    return () => {
      // TODO: Implement binding.root.destroy when Loro API is available
      // newBinding.root.destroy(newBinding);
      console.log('🧹 Cleaning up Loro binding');
    };
  }, [editor, provider, id, loroDocMap, doc, excludedProperties]);

  // Wait for provider and binding (following YJS pattern exactly)
  if (!provider || !binding) {
    return <></>;
  }

  // Render cursors component (following YJS pattern exactly)
  return (
    <LoroCollaborationCursors
      awarenessData={awarenessData}
      binding={binding}
      collabContext={collabContext}
      color={color}
      cursorsContainerRef={cursorsContainerRef}
      editor={editor}
      id={id}
      initialEditorState={initialEditorState}
      name={name}
      provider={provider}
      setDoc={setDoc}
      shouldBootstrap={shouldBootstrap}
      loroDocMap={loroDocMap}
      syncCursorPositionsFn={syncCursorPositionsFn}
      onPeerIdChange={onPeerIdChange}
      onAwarenessChange={onAwarenessChange}
    />
  );
}

/**
 * LoroCollaborationCursors - Following YJS YjsCollaborationCursors pattern exactly
 * 
 * This component handles the actual collaboration hooks and cursor management:
 * 1. Main collaboration hook (useLoroCollaboration)
 * 2. History hook (useLoroHistory) 
 * 3. Focus tracking hook (useLoroFocusTracking)
 * 4. Client ID assignment to context
 * 5. Returns cursor portal
 */
function LoroCollaborationCursors({
  editor,
  id,
  provider,
  loroDocMap,
  name,
  color,
  shouldBootstrap,
  cursorsContainerRef,
  initialEditorState,
  awarenessData,
  collabContext,
  binding,
  setDoc,
  syncCursorPositionsFn,
  onPeerIdChange,
  onAwarenessChange,
}: {
  editor: LexicalEditor;
  id: string;
  provider: LoroProvider;
  loroDocMap: Map<string, LoroDoc>;
  name: string;
  color: string;
  shouldBootstrap: boolean;
  binding: LoroBinding;
  setDoc: React.Dispatch<React.SetStateAction<LoroDoc | undefined>>;
  cursorsContainerRef?: LoroCursorsContainerRef | undefined;
  initialEditorState?: InitialEditorStateType | undefined;
  awarenessData?: object;
  collabContext: LoroCollaborationContextType;
  syncCursorPositionsFn?: SyncLoroCursorPositionsFn;
  onPeerIdChange?: (peerId: string) => void;
  onAwarenessChange?: (awareness: Array<{peerId: string, userName: string, isCurrentUser?: boolean}>) => void;
}) {
  // Main collaboration hook (following YJS pattern exactly)
  const cursors = useLoroCollaboration(
    editor,
    id,
    provider,
    loroDocMap,
    name,
    color,
    shouldBootstrap,
    binding,
    setDoc,
    cursorsContainerRef,
    initialEditorState,
    awarenessData,
    syncCursorPositionsFn,
  );

  // Handle peer data from provider events
  useEffect(() => {
    if (!provider) return;

    // Set peer ID when available
    if (provider.clientId && onPeerIdChange) {
      onPeerIdChange(provider.clientId);
    }

    // Listen for welcome messages with peer data
    const handleWelcome = (data: any) => {
      if (data.peers && onAwarenessChange) {
        // Convert peer data from server format to awareness format
        const awarenessData = data.peers.map((peer: any) => ({
          peerId: peer.id || peer.clientId,
          userName: peer.displayId || peer.id?.slice(-4) || 'User',
          isCurrentUser: peer.isCurrentUser || peer.clientId === provider.clientId
        }));
        onAwarenessChange(awarenessData);
      }
      
      // Also set peer ID from welcome message
      if (data.clientId && onPeerIdChange) {
        onPeerIdChange(data.clientId);
      }
    };

    // Listen for peer updates
    const handlePeerUpdate = (data: any) => {
      if (data.peers && onAwarenessChange) {
        const awarenessData = data.peers.map((peer: any) => ({
          peerId: peer.id || peer.clientId,
          userName: peer.displayId || peer.id?.slice(-4) || 'User',
          isCurrentUser: peer.isCurrentUser || peer.clientId === provider.clientId
        }));
        onAwarenessChange(awarenessData);
      }
    };

    provider.on('welcome', handleWelcome);
    provider.on('peerUpdate', handlePeerUpdate);

    return () => {
      provider.off('welcome', handleWelcome);
      provider.off('peerUpdate', handlePeerUpdate);
    };
  }, [provider, onPeerIdChange, onAwarenessChange]);

  // Set client ID in context (following YJS pattern exactly)
  collabContext.clientID = binding.clientID;

  // Register hooks (following YJS pattern exactly)
  useLoroHistory(editor, binding);
  useLoroFocusTracking(editor, provider, name, color, awarenessData);

  return cursors;
}
