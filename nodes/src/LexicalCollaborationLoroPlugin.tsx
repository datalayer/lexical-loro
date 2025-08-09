/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {JSX} from 'react';
import type {LoroDoc} from 'loro-crdt';

import {
  type CollaborationLoroContextType,
  useCollaborationLoroContext,
} from './LexicalCollaborationLoroContext';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  Binding,
  createBinding,
  ExcludedProperties,
  Provider,
  SyncCursorPositionsFn,
} from '.';
import {LexicalEditor} from 'lexical';
import {useEffect, useRef, useState} from 'react';

import {InitialEditorStateType} from '@lexical/react/LexicalComposer';
import {
  CursorsContainerRef,
  useLoroCollaboration,
  useLoroFocusTracking,
  useLoroHistory,
} from './useLoroCollaboration';

type Props = {
  id: string;
  providerFactory: (
    // eslint-disable-next-line no-shadow
    id: string,
    loroDocMap: Map<string, LoroDoc>,
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
};

export function CollaborationLoroPlugin({
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
}: Props): JSX.Element {
  const isBindingInitialized = useRef(false);
  const isProviderInitialized = useRef(false);

  const collabContext = useCollaborationLoroContext(username, cursorColor);

  const {loroDocMap, name, color} = collabContext;

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
  const providerRef = useRef<Provider | null>(null);

  useEffect(() => {
    if (isProviderInitialized.current || providerRef.current) {
      return;
    }

    isProviderInitialized.current = true;

    const newProvider = providerFactory(id, loroDocMap);
    providerRef.current = newProvider;
    setProvider(newProvider);
    
    const loroDoc = loroDocMap.get(id);
    if (loroDoc) {
      setDoc(loroDoc);
      console.log('Provider initialized for ID:', id, 'with LoroDoc');
    } else {
      console.error('No LoroDoc found in map for ID:', id);
    }

    // Return cleanup function that will be called when the component unmounts
    // Don't disconnect immediately, only on unmount
    return () => {
      console.log('Cleaning up provider for:', id);
      if (providerRef.current) {
        providerRef.current.disconnect();
        providerRef.current = null;
      }
      isProviderInitialized.current = false;
    };
  }, [id, providerFactory, loroDocMap]);

  const [binding, setBinding] = useState<Binding>();
  const bindingRef = useRef<Binding | null>(null);

  useEffect(() => {
    if (!provider) {
      return;
    }

    if (isBindingInitialized.current || bindingRef.current) {
      return;
    }

    isBindingInitialized.current = true;

    const loroDoc = doc || loroDocMap.get(id);
    if (!loroDoc) {
      console.error('No LoroDoc available for collaboration, ID:', id);
      return;
    }

    console.log('Creating binding for ID:', id, 'with LoroDoc');
    const newBinding = createBinding(
      editor,
      provider,
      id,
      loroDoc,
      loroDocMap,
      excludedProperties,
    );
    bindingRef.current = newBinding;
    setBinding(newBinding);

    return () => {
      console.log('Cleaning up binding for:', id);
      if (bindingRef.current) {
        // TODO: Implement proper cleanup for Loro binding
        // bindingRef.current.root.destroy(bindingRef.current);
        bindingRef.current = null;
      }
      isBindingInitialized.current = false;
    };
  }, [editor, provider, id, loroDocMap, doc, excludedProperties]);

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
      syncCursorPositionsFn={syncCursorPositionsFn}
    />
  );
}

function LoroCollaborationCursors({
  awarenessData,
  binding,
  collabContext,
  color,
  cursorsContainerRef,
  editor,
  id,
  initialEditorState,
  name,
  provider,
  setDoc,
  shouldBootstrap,
  syncCursorPositionsFn,
}: {
  awarenessData?: object;
  binding: Binding;
  collabContext: CollaborationLoroContextType;
  color: string;
  cursorsContainerRef?: CursorsContainerRef;
  editor: LexicalEditor;
  id: string;
  initialEditorState?: InitialEditorStateType;
  name: string;
  provider: Provider;
  setDoc: React.Dispatch<React.SetStateAction<LoroDoc | undefined>>;
  shouldBootstrap: boolean;
  syncCursorPositionsFn?: SyncCursorPositionsFn;
}): JSX.Element {
  collabContext.clientID = String(binding.clientID);

  const cursors = useLoroCollaboration(
    editor,
    id,
    provider,
    collabContext.loroDocMap,
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

  useLoroFocusTracking(editor, provider, name, color, awarenessData);
  useLoroHistory(editor, binding);

  return cursors;
}
