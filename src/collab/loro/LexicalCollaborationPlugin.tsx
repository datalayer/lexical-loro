/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type {JSX} from 'react';
import {useEffect, useRef, useState} from 'react';
import {LexicalEditor} from 'lexical';
import {InitialEditorStateType} from '@lexical/react/LexicalComposer';
import type {LoroDoc} from 'loro-crdt';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  type CollaborationContextType,
  useCollaborationContext,
  generateDeterministicUserData,
} from './LexicalCollaborationContext';
import { Provider, updateLocalStateName } from './State';
import {
  CursorsContainerRef,
  useCollaboration,
  useFocusTracking,
  useHistory,
} from './useCollaboration';
import { SyncCursorPositionsFn } from './sync/SyncCursors';
import { Binding, createBinding, ExcludedProperties, LoroCollaborationUI } from './Bindings';
import { collaboratorsOf, type Collaborator } from './collaborators';

type Props = {
  id: string;
  providerFactory: (
    id: string,
    docMap: Map<string, LoroDoc>,
    websocketUrl?: string,
  ) => Provider;
  shouldBootstrap: boolean;
  username?: string;
  cursorColor?: string;
  cursorsContainerRef?: CursorsContainerRef;
  initialEditorState?: InitialEditorStateType;
  excludedProperties?: ExcludedProperties;
  // `awarenessData` parameter allows arbitrary data to be added to the awareness.
  awarenessData?: object;
  syncCursorPositionsFn?: SyncCursorPositionsFn;
  // Show collaborators list at the top of the editor
  showCollaborators?: boolean;
  // WebSocket URL to use instead of the hardcoded one in wsProvider
  websocketUrl?: string;
  // Handler called when the initial snapshot is loaded
  onInitialization?: (isInitialized: boolean) => void;
  // Handler called once the local collaborator identity is resolved
  onIdentityResolved?: (identity: {
    name: string;
    color: string;
    clientID: number;
  }) => void;
  // Handler told who is in the room, as its awareness changes: for what a
  // host shows beside the editor, such as a collaboration rail.
  onCollaboratorsChange?: (collaborators: Array<Collaborator>) => void;
};

function getIdentityField(
  awarenessData: object | undefined,
  keys: string[],
): string | undefined {
  if (!awarenessData || typeof awarenessData !== 'object') {
    return undefined;
  }

  const data = awarenessData as Record<string, unknown>;
  const user = data.user;
  const userRecord =
    user && typeof user === 'object' ? (user as Record<string, unknown>) : undefined;

  for (const key of keys) {
    const direct = data[key];
    if (typeof direct === 'string' && direct.trim().length > 0) {
      return direct;
    }
    if (userRecord) {
      const nested = userRecord[key];
      if (typeof nested === 'string' && nested.trim().length > 0) {
        return nested;
      }
    }
  }

  return undefined;
}

export function LoroCollaborationPlugin({
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
  showCollaborators = true,
  websocketUrl = 'ws://localhost:3002',
  onInitialization,
  onIdentityResolved,
  onCollaboratorsChange,
}: Props): JSX.Element {
  const isBindingInitialized = useRef(false);
  const isProviderInitialized = useRef(false);

  const collabContext = useCollaborationContext(username, cursorColor);

  const {docMap, name, color} = collabContext;

  const [editor] = useLexicalComposerContext();

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

  const [provider, setProvider] = useState<Provider>();
  const [doc, setDoc] = useState<LoroDoc>();

  useEffect(() => {
    if (isProviderInitialized.current) {
      return;
    }

    isProviderInitialized.current = true;

    const provider = providerFactory(id, docMap, websocketUrl);
    setProvider(provider);
    setDoc(docMap.get(id));

    return () => {
      provider.disconnect();
    };
  }, [id, providerFactory, docMap, websocketUrl]);

  const [binding, setBinding] = useState<Binding>();

  useEffect(() => {
    if (!provider) {
      return;
    }

    if (isBindingInitialized.current) {
      return;
    }

    isBindingInitialized.current = true;

    const binding = createBinding(
      editor,
      provider,
      id,
      doc || docMap.get(id),
      docMap,
      excludedProperties,
    );

    const deterministicUserData = generateDeterministicUserData(binding.clientID);

    // Prefer explicit username/color first, then awareness identity, then deterministic fallback.
    const awarenessDisplayName = getIdentityField(awarenessData, [
      'display_name',
      'displayName',
      'name',
      'username',
      'handle',
    ]);
    const awarenessColor = getIdentityField(awarenessData, ['color']);
    const finalName = username || awarenessDisplayName || deterministicUserData.name;
    const finalColor = cursorColor || awarenessColor || deterministicUserData.color;
    
    collabContext.name = finalName;
    collabContext.color = finalColor;
    collabContext.clientID = binding.clientID;

    // Notify listeners of the resolved local collaborator identity.
    onIdentityResolved?.({
      name: finalName,
      color: finalColor,
      clientID: binding.clientID,
    });

    // Update the awareness state immediately with the resolved identity.
    updateLocalStateName(provider, finalName, finalColor);
    
    setBinding(binding);

    return () => {
      // Clean up binding resources if needed
    };
  }, [editor, provider, id, docMap, doc, excludedProperties, collabContext, username, cursorColor, awarenessData]);

  if (!provider || !binding) {
    return <></>;
  }

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
      docMap={docMap}
      syncCursorPositionsFn={syncCursorPositionsFn}
      showCollaborators={showCollaborators}
      onInitialization={onInitialization}
      onCollaboratorsChange={onCollaboratorsChange}
    />
  );
}

function LoroCollaborationCursors({
  editor,
  id,
  provider,
  docMap,
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
  showCollaborators = false,
  onInitialization,
  onCollaboratorsChange,
}: {
  editor: LexicalEditor;
  id: string;
  provider: Provider;
  docMap: Map<string, LoroDoc>;
  name: string;
  color: string;
  shouldBootstrap: boolean;
  binding: Binding;
  setDoc: React.Dispatch<React.SetStateAction<LoroDoc | undefined>>;
  cursorsContainerRef?: CursorsContainerRef | undefined;
  initialEditorState?: InitialEditorStateType | undefined;
  awarenessData?: object;
  collabContext: CollaborationContextType;
  syncCursorPositionsFn?: SyncCursorPositionsFn;
  showCollaborators?: boolean;
  onInitialization?: (isInitialized: boolean) => void;
  onCollaboratorsChange?: (collaborators: Array<Collaborator>) => void;
}) {
  const cursorsElement = useCollaboration(
    editor,
    id,
    provider,
    docMap,
    name,
    color,
    shouldBootstrap,
    binding,
    setDoc,
    cursorsContainerRef,
    initialEditorState,
    awarenessData,
    syncCursorPositionsFn,
    onInitialization,
  );

  collabContext.clientID = binding.clientID;

  useHistory(editor, binding);
  useFocusTracking(editor, provider, name, color, awarenessData);

  // Who is in the room, told to the host each time the awareness changes.
  useEffect(() => {
    if (!onCollaboratorsChange) {
      return;
    }
    const {awareness} = provider;
    const tell = () =>
      onCollaboratorsChange(collaboratorsOf(awareness.getStates(), binding.clientID));
    tell();
    awareness.on('update', tell);
    return () => {
      awareness.off('update', tell);
    };
  }, [binding, onCollaboratorsChange, provider]);

  if (showCollaborators) {
    return (
      <LoroCollaborationUI
        binding={binding}
        cursorsContainer={cursorsElement}
        currentUserName={name}
        currentUserColor={color}
        showCollaborators={true}
      />
    );
  }

  return cursorsElement;
}
