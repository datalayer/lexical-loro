/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import {CollaborationLoroPlugin} from '../LexicalCollaborationLoroPlugin';
import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {Fragment, useCallback, useEffect, useRef, useState} from 'react';
import {LoroDoc} from 'loro-crdt';

import Editor from './Editor';
import ExampleTheme from './ExampleTheme';
import {getRandomUserProfile, UserProfile} from './getRandomUserProfile';
import {createLoroProvider} from './providers';

import type {Provider} from '..';

interface ActiveUserProfile extends UserProfile {
  userId: number;
}

const editorConfig = {
  // NOTE: This is critical for collaboration plugin to set editor state to null. It
  // would indicate that the editor should not try to set any default state
  // (not even empty one), and let collaboration plugin do it instead
  editorState: null,
  namespace: 'React.js Collab Demo',
  nodes: [],
  // Handling of errors during update
  onError(error: Error) {
    throw error;
  },
  // The editor theme
  theme: ExampleTheme,
};

export default function App() {
  const [userProfile, setUserProfile] = useState(() => getRandomUserProfile());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loroProvider, setLoroProvider] = useState<null | Provider>(null);
  const [connected, setConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<ActiveUserProfile[]>([]);

  const handleAwarenessUpdate = useCallback(() => {
    if (!loroProvider || !loroProvider.awareness) {
      return;
    }
    const awareness = loroProvider.awareness;
    const states = awareness.getStates();
    setActiveUsers(
      Array.from(states.entries()).map(
        ([userId, state]: [number, {color?: string; name?: string}]) => ({
          color: state.color || '#000000',
          name: state.name || 'Anonymous',
          userId,
        }),
      ),
    );
  }, [loroProvider]);

  const handleConnectionToggle = () => {
    if (loroProvider == null) {
      return;
    }
    if (connected) {
      loroProvider.disconnect();
    } else {
      loroProvider.connect();
    }
  };

  useEffect(() => {
    if (loroProvider == null) {
      return;
    }

    loroProvider.awareness.on('update', handleAwarenessUpdate);

    return () => loroProvider.awareness.off('update', handleAwarenessUpdate);
  }, [loroProvider, handleAwarenessUpdate]);

  const providerFactory = useCallback(
    (id: string, loroDocMap: Map<string, LoroDoc>) => {
      // Check if we already have a document for this ID
      let doc = loroDocMap.get(id);
      if (!doc) {
        // Create new document and add it to the map
        doc = new LoroDoc();
        loroDocMap.set(id, doc);
        console.log('Created new LoroDoc for ID:', id);
      }

      const provider = createLoroProvider(id, doc); // Pass the document to the provider
      provider.on('status', (event) => {
        setConnected(
          event.status === 'connected'
        );
      });

      // This is a hack to get reference to provider with standard CollaborationPlugin.
      // To be fixed in future versions of Lexical.
      setTimeout(() => setLoroProvider(provider), 0);

      return provider;
    },
    [],
  );

  return (
    <div ref={containerRef}>
      <p>
        <b>Used provider:</b> Loro CRDT
        <br />
        <button onClick={handleConnectionToggle}>
          {connected ? 'Disconnect' : 'Connect'}
        </button>
      </p>
      <p>
        <b>My Name:</b>{' '}
        <input
          type="text"
          value={userProfile.name}
          onChange={(e) =>
            setUserProfile((profile) => ({...profile, name: e.target.value}))
          }
        />{' '}
        <input
          type="color"
          value={userProfile.color}
          onChange={(e) =>
            setUserProfile((profile) => ({...profile, color: e.target.value}))
          }
        />
      </p>
      <p>
        <b>Active users:</b>{' '}
        {activeUsers.map(({name, color, userId}, idx) => (
          <Fragment key={userId}>
            <span style={{color}}>{name}</span>
            {idx === activeUsers.length - 1 ? '' : ', '}
          </Fragment>
        ))}
      </p>
      <LexicalComposer initialConfig={editorConfig}>
        {/* With CollaborationPlugin - we MUST NOT use @lexical/react/LexicalHistoryPlugin */}
        <CollaborationLoroPlugin
          id="lexical/react-rich-collab-loro"
          providerFactory={providerFactory}
          // Unless you have a way to avoid race condition between 2+ users trying to do bootstrap simultaneously
          // you should never try to bootstrap on client. It's better to perform bootstrap within Loro server.
          shouldBootstrap={false}
          username={userProfile.name}
          cursorColor={userProfile.color}
          cursorsContainerRef={containerRef}
        />
        <Editor />
      </LexicalComposer>
    </div>
  );
}
