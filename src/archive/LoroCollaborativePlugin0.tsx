import { useCallback, useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  type ContainerID,
  LoroDoc,
  LoroMap,
  type LoroEventBatch,
  type Subscription,
} from 'loro-crdt';
import { $getNodeByKey, TextNode } from 'lexical';
import { CounterNode } from '../examples/CounterNode';

interface LoroCollaborativePlugin0Props {
  websocketUrl: string;
  docId: string;
  containerId?: ContainerID;
  onConnectionChange?: (connected: boolean) => void;
  onDisconnectReady?: (disconnectFn: () => void) => void;
  debug?: boolean;
}

export default function LoroCollaborativePlugin0({ websocketUrl, docId, containerId, onConnectionChange, onDisconnectReady, debug = false }: LoroCollaborativePlugin0Props) {
  const [editor] = useLexicalComposerContext();
  const wsRef = useRef<WebSocket | null>(null);
  const docRef = useRef<LoroDoc>(new LoroDoc());
  const mapRef = useRef<LoroMap | null>(null);
  const unsubscribeRef = useRef<Subscription | null>(null);

  // Disconnect function
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    onConnectionChange?.(false);
  }, [onConnectionChange]);

  // Expose disconnect function to parent
  useEffect(() => {
    onDisconnectReady?.(disconnect);
  }, [onDisconnectReady, disconnect]);

  // Hex -> Uint8Array (browser-safe)
  const hexToBytes = (hex: string): Uint8Array => {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const len = Math.floor(clean.length / 2);
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  };

  // Apply Loro Map('editorState') into Lexical
  const applyLexicalEditorState = useCallback(() => {
    try {
      const m = mapRef.current;
      if (!m) return;
      const state = m.get('editorState');
      if (state && typeof state === 'object') {
        const next = editor.parseEditorState(state as any);
        editor.setEditorState(next);
        if (debug) console.log('[LoroCollaborativePlugin0] Lexical state updated from Loro map');
      }
    } catch (e) {
      console.error('[LoroCollaborativePlugin0] Failed to apply Lexical state from Loro:', e);
    }
  }, [editor, debug]);

  // Initialize LoroMap
  useEffect(() => {
    mapRef.current = docRef.current.getMap(docId);
  // On first mount, if doc already has state, hydrate Lexical once
  applyLexicalEditorState();
  }, [docId, applyLexicalEditorState]);

  // WebSocket setup (receive-only; inbound updates trigger Loro events)
  useEffect(() => {
    const ws = new WebSocket(websocketUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (debug) console.log('[LoroCollaborativePlugin0] WebSocket connected');
      onConnectionChange?.(true);
    };

    ws.onmessage = (event) => {
      try {
        // Binary fallback (not used by current server, but kept for compatibility)
        if (event.data instanceof ArrayBuffer) {
          const update = new Uint8Array(event.data);
          docRef.current.import(update);
          if (debug) console.log('[LoroCollaborativePlugin0] Applied binary update');
          return;
        }

    // Server sends JSON messages with hex payloads
        const text = typeof event.data === 'string' ? event.data : '' + event.data;
        const msg = JSON.parse(text);

        switch (msg.type) {
          case 'initial-snapshot': {
            const { snapshotHex, docId: incomingDocId } = msg;
            if (!snapshotHex) break;
            // If a specific docId is being used, only import matching snapshots
            if (!docId || incomingDocId === docId) {
      const bytes = hexToBytes(snapshotHex);
              docRef.current.import(bytes);
              if (debug) console.log(`[LoroCollaborativePlugin0] Imported initial snapshot for ${incomingDocId} (${bytes.length} bytes)`);
            }
            break;
          }
          case 'loro-update': {
            const { updateHex, docId: incomingDocId } = msg;
            if (!updateHex) break;
            if (!docId || incomingDocId === docId) {
      const bytes = hexToBytes(updateHex);
              docRef.current.import(bytes);
              if (debug) console.log(`[LoroCollaborativePlugin0] Applied loro-update for ${incomingDocId} (${bytes.length} bytes)`);
            }
            break;
          }
          case 'ephemeral-update':
          case 'ephemeral-event':
          case 'client-disconnect':
          case 'snapshot-request':
          case 'welcome':
          default: {
            if (debug) console.log('[LoroCollaborativePlugin0] Ignored message:', msg.type);
          }
        }
      } catch (e) {
        if (debug) console.error('[LoroCollaborativePlugin0] Error handling message', e);
      }
    };

    ws.onclose = () => {
      if (debug) console.log('[LoroCollaborativePlugin0] WebSocket disconnected');
      onConnectionChange?.(false);
    };

    ws.onerror = (err) => {
      console.error('[LoroCollaborativePlugin0] WebSocket error', err);
      onConnectionChange?.(false);
    };

    return () => {
      disconnect();
    };
  }, [websocketUrl, onConnectionChange, debug, docId, disconnect]);

  // Event-driven updates (ProseMirror sync-plugin style):
  // - subscribe to doc or container
  // - only react to non-local events to update UI/state
  useEffect(() => {
    // Clean up previous subscription if any
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;

    const doc = docRef.current;
    const target = containerId ? doc.getContainerById(containerId) : doc;

    if (!target) return;

    const unsubscribe = target.subscribe((event: LoroEventBatch) => {
      // Local changes are initiated by this client; skip UI refresh to avoid echo
      if (event.by === 'local' && event.origin !== 'undo') return;

      if (debug) {
        console.log('[LoroCollaborativePlugin0] Remote Loro event:', {
          by: event.by,
          origin: event.origin,
          targets: event.events.map(e => e.target),
        });
      }
      // Apply to Lexical
      applyLexicalEditorState();
    });

    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [containerId, docId, debug, applyLexicalEditorState]);

  useEffect(() => {
    const removeMutationListener = editor.registerMutationListener(
      TextNode,
      (mutatedNodes, { updateTags, dirtyLeaves, prevEditorState }) => {
        console.log('---', updateTags, dirtyLeaves, prevEditorState);
        for (const [nodeKey, mutation] of mutatedNodes) {
          console.log('---', nodeKey, mutation);
          editor.read(() => {
            console.log('----', $getNodeByKey(nodeKey));
          });
        }
      },
      {skipInitialization: false}
    );
    return removeMutationListener;
  }, [editor]);

  useEffect(() => {
    const removeTransform = editor.registerNodeTransform(TextNode, (node) => {
      if (node.getTextContent() === 'blue') {
        node.setTextContent('green');
      }
    });
    return removeTransform;
  }, [editor]);

  useEffect(() => {
    const removeTransform = editor.registerNodeTransform(CounterNode, (node) => {
      console.log('-----', node);
    });
    return removeTransform;
  }, [editor]);

  return null;

}
