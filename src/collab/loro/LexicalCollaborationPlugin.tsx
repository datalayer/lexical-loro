import type {JSX} from 'react';
import {useEffect, useRef, useState} from 'react';
import {LexicalEditor} from 'lexical';
import {InitialEditorStateType} from '@lexical/react/LexicalComposer';
import type {LoroDoc} from 'loro-crdt';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  type CollaborationContextType,
  useCollaborationContext,
} from './LexicalCollaborationContext';
import { Provider } from './State';
import {
  CursorsContainerRef,
  useCollaboration,
  useFocusTracking,
  useHistory,
} from './useCollaboration';
import { SyncCursorPositionsFn } from './sync/SyncCursors';
import { Binding, createBinding, ExcludedProperties } from './Bindings';

type Props = {
  id: string;
  providerFactory: (
    id: string,
    docMap: Map<string, LoroDoc>,
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
  const [doc, setDoc] = useState<LoroDoc>();

  useEffect(() => {
    if (isProviderInitialized.current) {
      return;
    }

    isProviderInitialized.current = true;

    const provider = providerFactory(id, docMap);
    setProvider(provider);
    setDoc(docMap.get(id));

    return () => {
      provider.disconnect();
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

    console.log('🚀 [LORO-PLUGIN] Creating binding with id:', id);
    
    const binding = createBinding(
      editor,
      provider,
      id,
      doc || docMap.get(id),
      docMap,
      excludedProperties,
    );
    setBinding(binding);
    
    console.log('✅ [LORO-PLUGIN] Binding created, root children length:', binding.root._children.length);
    console.log('🔍 [LORO-PLUGIN] Root structure:', binding.root);
    
    // Add immediate debug info to page title for visibility
    document.title = `LORO: ${binding.root._children.length} children`;
    
    // Debug after initial sync
    setTimeout(() => {
      console.log('⏰ [LORO-PLUGIN] After initial sync - root children length:', binding.root._children.length);
      console.log('⏰ [LORO-PLUGIN] After initial sync - root structure:', binding.root);
      // Update title with final count
      document.title = `LORO: ${binding.root._children.length} children (synced)`;
      // Add visual debug to page
      if ((window as any).debugLoro?.addDebugToPage) {
        (window as any).debugLoro.addDebugToPage();
      }
    }, 1000);

    return () => {
      binding.root.destroy(binding);
    };
  }, [editor, provider, id, docMap, doc, excludedProperties]);

  if (!provider || !binding) {
    return <></>;
  }

  return (
    <CRDTCollaborationCursors
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

function CRDTCollaborationCursors({
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
  );

  collabContext.clientID = binding.clientID;

  useHistory(editor, binding);
  useFocusTracking(editor, provider, name, color, awarenessData);

  return cursorsElement;
}
