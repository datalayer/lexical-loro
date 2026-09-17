/*
 * Copyright (c) 2021-Present Datalayer, Inc.
 *
 * MIT License
 */

/**
 * This package's own example: one document, two panes, Loro between them.
 *
 * The editor is `@datalayer/jupyter-lexical`'s — its plugins, its nodes, its
 * Primer theming — and what this package adds is underneath it: the Loro
 * binding the editor reaches through `collaboration`. The example used to be
 * the Lexical playground vendored whole, some 46,000 lines of plugins, nodes
 * and UI that had drifted from the copies in jupyter-lexical; none of it was
 * what this package is for.
 *
 * Open it twice, or leave the second pane on, and type in either.
 *
 * Run `npm run server:py:ws` (or `npm run server:loro`) first: the pane needs
 * a room to join, and the address bar can point it elsewhere —
 * `?room=…`, `?ws=…`, `?panes=1`.
 *
 * @module example/LoroExample
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import { Box, Heading, Text } from '@primer/react';
import { Editor, LexicalProvider } from '@datalayer/jupyter-lexical';
import {
  CollaborationContext,
  type CollaborationContextType,
} from '@datalayer/lexical-loro';
import { useCollaboratorColor } from '@datalayer/primer-addons';

/** The websocket the Python server listens on (`npm run server:py:ws`). */
const DEFAULT_WEBSOCKET_URL = 'ws://localhost:3002';

/** The room two panes have to agree on to see each other. */
const DEFAULT_ROOM = 'lexical-loro-example';

/**
 * Who a pane says it is. The colour its caret wears is the theme's collaborator
 * palette's, picked by the name — the same one the other pane gives it.
 */
const PEOPLE = [{ username: 'Collaborator 1' }, { username: 'Collaborator 2' }];

/**
 * What the room starts with, when it starts empty.
 *
 * Only the first pane offers it. The editor draws nothing until the room has
 * said what it holds, so an empty room with nobody seeding it leaves both
 * panes waiting; and both panes seeding it would write the same paragraph
 * into the document twice.
 */
const SEED = JSON.stringify({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        textFormat: 0,
        textStyle: '',
        children: [
          {
            type: 'text',
            text: 'Type here. The other pane is the same document, over Loro.',
            format: 0,
            style: '',
            mode: 'normal',
            detail: 0,
            version: 1,
          },
        ],
      },
    ],
  },
});

function Pane({
  who,
  room,
  websocketUrl,
  seeds,
}: {
  who: (typeof PEOPLE)[number];
  room: string;
  websocketUrl: string;
  /** Whether this pane offers the starting document; only the first does. */
  seeds: boolean;
}): JSX.Element {
  const color = useCollaboratorColor(who.username);
  const collaboration = useMemo(
    () => ({
      id: room,
      websocketUrl,
      username: who.username,
      initialEditorState: seeds ? SEED : undefined,
    }),
    [room, seeds, websocketUrl, who.username],
  );
  // Its own collaboration context, so its own document. The context keeps the
  // documents by room, and the default context is one object for the whole
  // page: two panes sharing it share one LoroDoc and one peer id, and the
  // binding, which tells remote changes from its own by peer, would take
  // everything the other pane wrote for its own and show none of it. Two
  // panes with two contexts are two peers, as two browsers would be.
  const context = useMemo<CollaborationContextType>(
    () => ({
      clientID: 0,
      color,
      isCollabActive: false,
      name: who.username,
      docMap: new Map(),
    }),
    [color, who.username],
  );
  return (
    <Box
      sx={{
        flex: '1 1 480px',
        minWidth: 0,
        border: '1px solid',
        borderColor: 'var(--borderColor-default)',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'var(--borderColor-default)',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Box
          aria-hidden="true"
          style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color }}
        />
        <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>{who.username}</Text>
      </Box>
      <CollaborationContext.Provider value={context}>
        <LexicalProvider>
          <Editor collaboration={collaboration} />
        </LexicalProvider>
      </CollaborationContext.Provider>
    </Box>
  );
}

export function LoroExample(): JSX.Element {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room') ?? DEFAULT_ROOM;
  const websocketUrl = params.get('ws') ?? DEFAULT_WEBSOCKET_URL;
  const panes = Number(params.get('panes') ?? '2') === 1 ? 1 : 2;

  return (
    <Box sx={{ p: 4, display: 'grid', gap: 3 }}>
      <Box sx={{ display: 'grid', gap: 1 }}>
        <Heading as="h1" sx={{ fontSize: 4 }}>
          Lexical, over Loro
        </Heading>
        <Text sx={{ color: 'var(--fgColor-muted)' }}>
          One document in room <code>{room}</code>, through{' '}
          <code>{websocketUrl}</code>. Type in either pane.
        </Text>
      </Box>
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {PEOPLE.slice(0, panes).map((who, index) => (
          <Pane
            key={who.username}
            who={who}
            room={room}
            websocketUrl={websocketUrl}
            seeds={index === 0}
          />
        ))}
      </Box>
    </Box>
  );
}

export default LoroExample;
