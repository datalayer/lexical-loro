/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {JSX} from 'react';
import type {Doc} from 'yjs';

import {
  type CollaborationContextType,
  useCollaborationContext,
} from './LexicalCollaborationContext';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  Binding,
  createBinding,
  ExcludedProperties,
  Provider,
  SyncCursorPositionsFn,
} from './impl';
import {LexicalEditor} from 'lexical';
import {useEffect, useRef, useState} from 'react';

import {InitialEditorStateType} from '@lexical/react/LexicalComposer';
import {
  CursorsContainerRef,
  useCollaboration,
  useFocusTracking,
  useHistory,
} from './useCollaboration';

type Props = {
  id: string;
  providerFactory: (
    // eslint-disable-next-line no-shadow
    id: string,
    docMap: Map<string, Doc>,
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

export function CollaborationPlugin({
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
  const [doc, setDoc] = useState<Doc>();

  useEffect(() => {
    if (isProviderInitialized.current) {
      return;
    }

    isProviderInitialized.current = true;

    const newProvider = providerFactory(id, docMap);
    setProvider(newProvider);
    setDoc(docMap.get(id));

    return () => {
      newProvider.disconnect();
    };
  }, [id, providerFactory, docMap]);

  const [binding, setBinding] = useState<Binding>();

  useEffect(() => {
    if (!provider) {
      return;
    }

    if (isBindingInitialized.current) {
      return;
    }

    isBindingInitialized.current = true;

    const newBinding = createBinding(
      editor,
      provider,
      id,
      doc || docMap.get(id),
      docMap,
      excludedProperties,
    );
    setBinding(newBinding);

    return () => {
      newBinding.root.destroy(newBinding);
    };
  }, [editor, provider, id, docMap, doc, excludedProperties]);

  if (!provider || !binding) {
    return <></>;
  }

  return (
    <YjsCollaborationCursors
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
    />
  );
}

function YjsCollaborationCursors({
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
}: {
  editor: LexicalEditor;
  id: string;
  provider: Provider;
  docMap: Map<string, Doc>;
  name: string;
  color: string;
  shouldBootstrap: boolean;
  binding: Binding;
  setDoc: React.Dispatch<React.SetStateAction<Doc | undefined>>;
  cursorsContainerRef?: CursorsContainerRef | undefined;
  initialEditorState?: InitialEditorStateType | undefined;
  awarenessData?: object;
  collabContext: CollaborationContextType;
  syncCursorPositionsFn?: SyncCursorPositionsFn;
}) {
  const cursors = useCollaboration(
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
  );

  collabContext.clientID = binding.clientID;

  useHistory(editor, binding);
  useFocusTracking(editor, provider, name, color, awarenessData);

  return cursors;
}
