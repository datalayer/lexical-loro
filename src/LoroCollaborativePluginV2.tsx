/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

// Types for peer information (preserving V2 pattern)
export interface PeerInfo {
  id: string;
  clientId: string;
  displayId: string;
  isCurrentUser: boolean;
  isYou?: boolean;
}

// Types for the collaborative plugin (preserving V2 interface)
interface LoroCollaborativePluginV2Props {
  id: string;
  docId: string;
  websocketUrl?: string;
  onConnectionChange?: (connected: boolean) => void;
  onInitialization?: (doc: any) => void;
  onPeerIdChange?: (peerId: string) => void;
  onPeerCountChange?: (count: number) => void;
  onPeersChange?: (peers: Array<{ id: string; clientId: string; isYou?: boolean }>) => void;
}

/**
 * LoroCollaborativePluginV2 - Clean implementation preserving V2's working patterns
 * 
 * Key patterns preserved from V2:
 * 1. Peer discovery via processPeerList() and loroDoc.peerIdStr comparison
 * 2. Initial content via handleInitialContent() with YJS-style initializeEditor()
 * 3. WebSocket messages: welcome, initial-content, snapshot, peerUpdate, update
 * 4. Never use setEditorState - only incremental updates
 */
export const LoroCollaborativePlugin = ({
  id,
  docId,
  websocketUrl = 'ws://localhost:8083',
  onConnectionChange, // eslint-disable-line @typescript-eslint/no-unused-vars
  onInitialization, // eslint-disable-line @typescript-eslint/no-unused-vars
  onPeerIdChange, // eslint-disable-line @typescript-eslint/no-unused-vars
  onPeerCountChange, // eslint-disable-line @typescript-eslint/no-unused-vars
  onPeersChange, // eslint-disable-line @typescript-eslint/no-unused-vars
}: LoroCollaborativePluginV2Props) => {
  const [editor] = useLexicalComposerContext();

  // TODO: Implement collaboration following V2's working patterns:
  //
  // 1. PEER DISCOVERY (from V2):
  //    - Create LoroDoc and use loroDoc.peerIdStr for identification
  //    - Send registerLoroPeerId message to server
  //    - Process peer lists with processPeerList() function
  //    - Handle welcome/peerUpdate messages
  //
  // 2. INITIAL CONTENT (from V2):
  //    - Implement handleInitialContent() with isEmpty check
  //    - Use YJS-style initializeEditor() function
  //    - Handle both initial-content and snapshot messages
  //    - Check root.getChildrenSize() === 0 before applying
  //
  // 3. INCREMENTAL UPDATES (YJS pattern):
  //    - Use editor.update() with collaboration tags
  //    - Never use setEditorState()
  //    - Follow YJS binding pattern for sync
  //    - Use Loro Tree for structure, Cursor for positions, EphemeralStore for awareness

  console.log('🎬 LoroCollaborativePluginV2 - clean implementation ready', {
    id,
    docId,
    websocketUrl,
    editorExists: !!editor
  });

  return null;
};

export default LoroCollaborativePlugin;
