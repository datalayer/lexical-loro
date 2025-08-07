import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  $createParagraphNode,
  $getRoot, 
  type LexicalEditor,
  type LexicalNode,
  type EditorState,
  $getSelection,
  $isRangeSelection,
  $getNodeByKey,
  type NodeKey,
  $isTextNode,
  $isElementNode,
  $isLineBreakNode
} from 'lexical';
import { createDOMRange, createRectsFromDOMRange } from '@lexical/selection';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LoroDoc, LoroText, Cursor, EphemeralStore } from 'loro-crdt';
import type { EphemeralStoreEvent, PeerID } from 'loro-crdt';

interface CursorProps {
  peerId: string;
  position: { top: number; left: number };
  color: string;
  name: string;
  isCurrentUser?: boolean;
  selection?: {
    rects: Array<{ top: number; left: number; width: number; height: number }>;
  };
}

const CursorComponent: React.FC<CursorProps> = ({ peerId, position, color, name, isCurrentUser, selection }) => {
  const displayName = `${name} (peer:${peerId})`;
  
  return (
    <>
      {/* Render selection backgrounds first (behind cursor) */}
      {selection && selection.rects.map((rect, index) => (
        <span
          key={`selection-${peerId}-${index}`}
          style={{
            position: 'fixed',
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            backgroundColor: color,
            opacity: 0.2,
            pointerEvents: 'none',
            zIndex: 1, // Behind cursor
          }}
        />
      ))}
      
      {/* Cursor caret */}
      <span
        style={{
          position: 'fixed',
          top: `${position.top}px`,
          left: `${position.left}px`,
          height: '20px', // Standard text line height
          width: '0px',
          pointerEvents: 'none',
          zIndex: 5,
          opacity: isCurrentUser ? 0.6 : 1.0,
        }}
      >
        {/* Selection background span (mimics Lexical's selection behavior) - keeping for consistency */}
        <span
          style={{
            position: 'absolute',
            left: '0',
            top: '0',
            backgroundColor: color,
            opacity: 0.3,
            height: '20px',
            width: '2px',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
        
        {/* Caret line (mimics Lexical's caret) */}
        <span
          style={{
            position: 'absolute',
            top: '0',
            bottom: '0',
            right: '-1px',
            width: '1px',
            backgroundColor: color,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          {/* User name label (mimics Lexical's cursor name styling) */}
          <span
            style={{
              position: 'absolute',
              left: '-2px',
              top: '-16px',
              backgroundColor: color,
              color: '#fff',
              lineHeight: '12px',
              fontSize: '12px',
              padding: '2px',
              fontFamily: 'Arial',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              borderRadius: '2px',
              maxWidth: '200px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayName}
          </span>
        </span>
      </span>
    </>
  );
};

interface CursorsContainerProps {
  remoteCursors: Record<PeerID, RemoteCursor>;
  getPositionFromLexicalPosition: (key: NodeKey, offset: number) => { top: number; left: number } | null;
  clientId: string;
  editor: LexicalEditor;
}

const CursorsContainer: React.FC<CursorsContainerProps> = ({ 
  remoteCursors, 
  getPositionFromLexicalPosition, 
  clientId,
  editor
}) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Create or get the cursor overlay container
    let container = document.getElementById('loro-cursor-overlay');
    if (!container) {
      container = document.createElement('div');
      container.id = 'loro-cursor-overlay';
      container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 999999;
        overflow: visible;
      `;
      document.body.appendChild(container);
      console.log('🎭 Created React portal cursor overlay container');
    }
    setPortalContainer(container);

    return () => {
      // Clean up container on unmount
      const existingContainer = document.getElementById('loro-cursor-overlay');
      if (existingContainer && existingContainer.parentNode) {
        existingContainer.parentNode.removeChild(existingContainer);
        console.log('🧹 Cleaned up cursor overlay container');
      }
    };
  }, []);

  if (!portalContainer) {
    return null;
  }

  console.log('🎯 Rendering cursors via React portal:', {
    remoteCursorsCount: Object.keys(remoteCursors).length,
    clientId
  });

  const cursors = Object.values(remoteCursors)
    .map(remoteCursor => {
      const { peerId, anchor, focus, user } = remoteCursor;
      if (!anchor) {
        console.log('⚠️ No anchor for peer:', peerId);
        return null;
      }

      try {
        // CRITICAL FIX: Use multiple attempts with fresh layout calculations
        let position = getPositionFromLexicalPosition(anchor.key, anchor.offset);
        
        // If position seems invalid or unreasonable, try to recalculate with forced layout
        if (!position || position.top < 0 || position.left < 0 || isNaN(position.top) || isNaN(position.left) || 
            position.top > window.innerHeight * 2 || position.left > window.innerWidth * 2) {
          console.log('⚠️ Initial position invalid/unreasonable, forcing layout update and recalculating...', position);
          
          // Force immediate DOM layout update
          const editorEl = document.querySelector('[contenteditable="true"]') as HTMLElement;
          if (editorEl) {
            void editorEl.offsetHeight; // Force synchronous layout
            void editorEl.offsetWidth;
          }
          
          // Try again with fresh layout
          position = getPositionFromLexicalPosition(anchor.key, anchor.offset);
          console.log('🔄 Recalculated position after layout update:', position);
        }
        
        if (!position || position.top < 0 || position.left < 0 || isNaN(position.top) || isNaN(position.left)) {
          console.log('⚠️ Final position still invalid for peer:', peerId, position);
          return null;
        }

        const color = user?.color || '#007acc';
        const displayName = user?.name || peerId.slice(-8);
        const isCurrentUser = peerId === clientId;

        // Calculate selection rectangles if there's a focus position different from anchor
        let selection: { rects: Array<{ top: number; left: number; width: number; height: number }> } | undefined;
        
        if (focus && (focus.key !== anchor.key || focus.offset !== anchor.offset)) {
          // There's a selection, calculate the selection rectangles
          console.log('� Calculating selection for peer:', peerId, { anchor, focus });
          
          try {
            // Use the provided editor instance to create a range from anchor to focus
            if (editor) {
              const rects = editor.getEditorState().read(() => {
                const anchorNode = $getNodeByKey(anchor.key);
                const focusNode = $getNodeByKey(focus.key);
                
                if (!anchorNode || !focusNode) {
                  console.log('⚠️ Selection nodes not found:', { anchorNode: !!anchorNode, focusNode: !!focusNode });
                  return [];
                }
                
                try {
                  // Create a DOM range from anchor to focus
                  const range = createDOMRange(
                    editor,
                    anchorNode,
                    anchor.offset,
                    focusNode,
                    focus.offset
                  );
                  
                  if (range) {
                    const rectList = createRectsFromDOMRange(editor, range);
                    console.log('📐 Selection rects calculated:', rectList.length);
                    
                    return rectList.map(rect => ({
                      top: rect.top,
                      left: rect.left,
                      width: rect.width,
                      height: rect.height
                    }));
                  }
                } catch (rangeError) {
                  console.warn('Error creating selection range:', rangeError);
                }
                
                return [];
              });
              
              if (rects.length > 0) {
                selection = { rects };
                console.log('✅ Selection calculated successfully for peer:', peerId, selection);
              }
            }
          } catch (selectionError) {
            console.warn('Error calculating selection for peer:', peerId, selectionError);
          }
        }

        console.log('�🟢 Rendering cursor for peer:', peerId, { 
          position, 
          color, 
          displayName, 
          isCurrentUser, 
          hasSelection: !!selection 
        });

        return (
          <CursorComponent
            key={peerId}
            peerId={peerId}
            position={{
              top: Math.max(position.top, 20),
              left: Math.max(position.left, 20)
            }}
            color={color}
            name={displayName}
            isCurrentUser={isCurrentUser}
            selection={selection}
          />
        );
      } catch (error) {
        console.warn('Error creating cursor for peer:', peerId, error);
        return null;
      }
    })
    .filter(Boolean);

  return createPortal(
    <>{cursors}</>,
    portalContainer
  );
};

class CursorAwareness {
  private ephemeralStore: EphemeralStore;
  private peerId: string;
  private listeners: Array<(states: Map<string, any>, event?: EphemeralStoreEvent) => void> = [];

  constructor(peer: PeerID, timeout: number = 300_000) { // 5 minutes instead of 30 seconds
    this.ephemeralStore = new EphemeralStore(timeout);
    this.peerId = peer.toString();
    
    // Subscribe to EphemeralStore events with proper event handling
    this.ephemeralStore.subscribe((event: EphemeralStoreEvent) => {
      console.log('🔔 EphemeralStore event received:', {
        by: event.by,
        added: event.added,
        updated: event.updated,
        removed: event.removed
      });
      
      // Notify all listeners about changes with event details
      this.notifyListeners(event);
      return true; // Continue subscription
    });
  }

  getAll(): {
    [peer in PeerID]: { 
      anchor?: Cursor; 
      focus?: Cursor; 
      user?: { name: string; color: string };
    }
  } {
    const ans: {
      [peer in PeerID]: {
        anchor?: Cursor;
        focus?: Cursor;
        user?: { name: string; color: string };
      };
    } = {};
    
    const allStates = this.ephemeralStore.getAllStates();
    
    for (const [peer, state] of Object.entries(allStates)) {
      const stateData = state as any;
      try {
        const decodedAnchor = stateData.anchor ? Cursor.decode(stateData.anchor) : undefined;
        const decodedFocus = stateData.focus ? Cursor.decode(stateData.focus) : undefined;
        
        ans[peer as PeerID] = {
          anchor: decodedAnchor,
          focus: decodedFocus,
          user: stateData.user ? stateData.user : undefined,
        };
      } catch (error) {
        console.warn('Error decoding cursor for peer', peer, error);
      }
    }
    return ans;
  }

  setLocal(state: {
    anchor?: Cursor;
    focus?: Cursor;
    user?: { name: string; color: string };
  }) {
    this.ephemeralStore.set(this.peerId, {
      anchor: state.anchor?.encode() || null,
      focus: state.focus?.encode() || null,
      user: state.user || null,
    });
  }

  getLocal() {
    const state = this.ephemeralStore.get(this.peerId);
    if (!state) {
      return undefined;
    }

    const stateData = state as any;
    try {
      return {
        anchor: stateData.anchor && Cursor.decode(stateData.anchor),
        focus: stateData.focus && Cursor.decode(stateData.focus),
        user: stateData.user,
      };
    } catch (error) {
      console.warn('Error decoding local cursor:', error);
      return undefined;
    }
  }

  getLocalState() {
    const state = this.ephemeralStore.get(this.peerId);
    if (!state) return null;
    
    const stateData = state as any;
    return {
      anchor: stateData.anchor || null,
      focus: stateData.focus || null,
      user: stateData.user || null,
    };
  }

  setRemoteState(peerId: PeerID, state: {
    anchor: Uint8Array | null;
    focus: Uint8Array | null;
    user: { name: string; color: string } | null;
  }) {
    console.log('Setting remote state for peer:', peerId, state);
    
    try {
      if (state === null || (state.anchor === null && state.focus === null)) {
        this.ephemeralStore.delete(peerId.toString());
        return;
      }

      // Store the raw state in EphemeralStore
      this.ephemeralStore.set(peerId.toString(), {
        anchor: state.anchor,
        focus: state.focus,
        user: state.user
      });

      // Validate and decode cursor data safely for callback
      let anchor: Cursor | undefined;
      let focus: Cursor | undefined;
      
      if (state.anchor && state.anchor.length > 0) {
        try {
          anchor = Cursor.decode(state.anchor);
        } catch (error) {
          console.warn('Failed to decode anchor cursor:', error);
        }
      }
      
      if (state.focus && state.focus.length > 0) {
        try {
          focus = Cursor.decode(state.focus);
        } catch (error) {
          console.warn('Failed to decode focus cursor:', error);
        }
      }
      
      if (anchor || focus) {
        // The awareness callback will handle the cursor conversion
        // Just trigger a notification that this peer's cursor has changed
        setTimeout(() => {
          // Force the awareness callback to run by notifying listeners
          this.notifyListeners();
        }, 0);
      }
    } catch (error) {
      console.error('Error processing remote state:', error);
    }
  }

  // Add methods for compatibility with existing code
  addListener(callback: (states: Map<string, any>, event?: EphemeralStoreEvent) => void) {
    this.listeners.push(callback as (states: Map<string, any>, event?: EphemeralStoreEvent) => void);
  }

  removeListener(callback: (states: Map<string, any>, event?: EphemeralStoreEvent) => void) {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  private notifyListeners(event?: EphemeralStoreEvent) {
    const states = new Map();
    const allStates = this.ephemeralStore.getAllStates();
    for (const [peer, state] of Object.entries(allStates)) {
      states.set(peer, state);
    }
    this.listeners.forEach(listener => listener(states, event));
  }

  // Get encoded data for network transmission
  encode(): Uint8Array {
    return this.ephemeralStore.encodeAll();
  }

  // Apply received encoded data
  apply(data: Uint8Array) {
    this.ephemeralStore.apply(data);
    // Trigger listeners after applying external data
    this.notifyListeners();
  }

  setRemoteCursorCallback(callback: (peerId: PeerID, cursor: RemoteCursor) => void) {
    (this as any)._onRemoteCursorUpdate = callback;
  }

  // Debug method to access raw ephemeral store data
  getRawStates() {
    return this.ephemeralStore.getAllStates();
  }
}

interface RemoteCursor {
  peerId: PeerID;
  anchor?: {
    key: NodeKey;
    offset: number;
  };
  focus?: {
    key: NodeKey;
    offset: number;
  };
  user?: { name: string; color: string };
  domElements?: {
    caret: HTMLElement;
    selections: HTMLElement[];
  };
}

interface LoroCollaborativePluginProps {
  websocketUrl: string;
  docId: string;
  onConnectionChange?: (connected: boolean) => void;
  onPeerIdChange?: (peerId: string) => void;
  onDisconnectReady?: (disconnectFn: () => void) => void;
  onAwarenessChange?: (awareness: Array<{peerId: string, userName: string, isCurrentUser?: boolean}>) => void;
}

interface LoroMessage {
  type: string;
  update?: number[];
  snapshot?: number[];
  docId?: string;
  clientId?: string;
  color?: string;
  position?: number;
  selection?: { start: number; end: number } | null;
  awareness?: number[];
  peerId?: string;
  awarenessState?: {
    anchor: Uint8Array | null;
    focus: Uint8Array | null;
    user: { name: string; color: string } | null;
  };
  data?: string; // Hex string for ephemeral updates
  event?: { // For ephemeral-event messages
    by: string;
    added: string[];
    updated: string[];
    removed: string[];
  };
}

export function LoroCollaborativePlugin({ 
  websocketUrl, 
  docId,
  onConnectionChange,
  onPeerIdChange,
  onDisconnectReady,
  onAwarenessChange
}: LoroCollaborativePluginProps) {
  const [editor] = useLexicalComposerContext();
  const wsRef = useRef<WebSocket | null>(null);
  const docRef = useRef<LoroDoc>(new LoroDoc());
  const textRef = useRef<LoroText | null>(null);
  const isLocalChange = useRef(false);
  const hasReceivedInitialSnapshot = useRef(false);
  
  // Cursor awareness system
  const awarenessRef = useRef<CursorAwareness | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<Record<PeerID, RemoteCursor>>({});
  const [clientId, setClientId] = useState<string>('');
  const [clientColor, setClientColor] = useState<string>('');
  const peerIdRef = useRef<string>(''); // Changed from numericPeerIdRef to handle string IDs
  const isConnectingRef = useRef<boolean>(false);
  const [forceUpdate, setForceUpdate] = useState(0); // Force cursor re-render
  const cursorTimestamps = useRef<Record<string, number>>({});

  const updateLoroFromLexical = useCallback((editorState: EditorState) => {
    if (!textRef.current) return;
    
    let editorStateJson = '';
    editorState.read(() => {
      // Store the raw Lexical EditorState JSON instead of HTML
      const serialized = editorState.toJSON();
      editorStateJson = JSON.stringify(serialized);
    });
    
    const currentLoroText = textRef.current.toString();
    if (currentLoroText === editorStateJson) return;

    // Mark this as a local change
    isLocalChange.current = true;
    
    // Replace the entire content with Lexical EditorState JSON
    textRef.current.delete(0, currentLoroText.length);
    textRef.current.insert(0, editorStateJson);
    
    // Send update to WebSocket server
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const update = docRef.current.exportFrom();
      wsRef.current.send(JSON.stringify({
        type: 'loro-update',
        update: Array.from(update),
        docId: docId
      }));

      // Also send a snapshot occasionally to keep server state updated
      if (Math.random() < 0.1) { // 10% chance to send snapshot
        const snapshot = docRef.current.exportSnapshot();
        wsRef.current.send(JSON.stringify({
          type: 'snapshot',
          snapshot: Array.from(snapshot),
          docId: docId
        }));
      }
    }

    // Reset the flag after a delay to prevent infinite loops
    setTimeout(() => {
      isLocalChange.current = false;
    }, 50);
  }, [docId]);

  const updateLexicalFromLoro = useCallback((editor: LexicalEditor, editorStateJson: string) => {
    if (isLocalChange.current) return; // Don't update if this is a local change
    
    isLocalChange.current = true;
    
    editor.update(() => {
      const root = $getRoot();
      
      // Get current EditorState JSON to compare
      const currentStateJson = JSON.stringify(editor.getEditorState().toJSON());
      
      // Only update if the content is actually different
      if (currentStateJson === editorStateJson) {
        isLocalChange.current = false;
        return;
      }
      
      try {
        if (editorStateJson && editorStateJson.trim().length > 0) {
          // Parse the Lexical EditorState JSON and restore it
          const parsedState = JSON.parse(editorStateJson);
          const newEditorState = editor.parseEditorState(parsedState);
          editor.setEditorState(newEditorState);
        } else {
          // Ensure there's always at least one paragraph
          root.clear();
          const paragraph = $createParagraphNode();
          root.append(paragraph);
        }
      } catch (error) {
        console.error('Error parsing EditorState JSON:', error);
        // Fallback: create empty paragraph
        root.clear();
        const paragraph = $createParagraphNode();
        root.append(paragraph);
      }
    }, { tag: 'collaboration' }); // Add collaboration tag

    // Reset the flag after a delay
    setTimeout(() => {
      isLocalChange.current = false;
    }, 50); // Reduced delay
  }, []);

  // Send cursor position using Awareness
  const updateCursorAwareness = useCallback(() => {
    if (!awarenessRef.current || !textRef.current) return;
    
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        try {
          // Get node keys and offsets for stable tracking
          const anchorKey = selection.anchor.key;
          const anchorOffset = selection.anchor.offset;
          const focusKey = selection.focus.key;
          const focusOffset = selection.focus.offset;
          
          console.log('🎯 Lexical selection:', {
            anchorNodeKey: anchorKey,
            anchorOffset: anchorOffset,
            focusNodeKey: focusKey,
            focusOffset: focusOffset
          });
          
          // Create Loro cursors for persistence, but also include stable node info
          // We need to properly calculate the global document position for multi-line content
          const root = $getRoot();
          
          // Helper function to calculate global document position from a node key and offset
          const calculateGlobalPosition = (nodeKey: NodeKey, offset: number): number => {
            let globalPosition = 0;
            let foundTarget = false;
            
            // Let's also get the full text content to compare with our calculation
            const fullTextContent = root.getTextContent();
            console.log('📍 Full document text content (for reference):', {
              fullText: JSON.stringify(fullTextContent),
              fullTextLength: fullTextContent.length
            });
            
            const traverseNodes = (node: LexicalNode, depth: number = 0): boolean => {
              const indent = '  '.repeat(depth);
              console.log(`📍 ${indent}Traversing node:`, {
                key: node.getKey(),
                type: node.getType(),
                isText: $isTextNode(node),
                isElement: $isElementNode(node),
                isParagraph: node.getType() === 'paragraph',
                currentGlobalPos: globalPosition
              });
              
              if ($isTextNode(node)) {
                const textContent = node.getTextContent();
                console.log(`📍 ${indent}Text node content:`, {
                  key: node.getKey(),
                  text: JSON.stringify(textContent),
                  length: textContent.length,
                  isTarget: node.getKey() === nodeKey
                });
                
                if (node.getKey() === nodeKey) {
                  // Found our target node, add the offset within this node
                  globalPosition += offset;
                  foundTarget = true;
                  console.log(`📍 ${indent}✅ FOUND TARGET! Final position:`, globalPosition);
                  return true; // Stop traversal
                } else {
                  // Add the entire length of this text node and continue
                  globalPosition += textContent.length;
                  console.log(`📍 ${indent}Added text length ${textContent.length}, new position:`, globalPosition);
                }
              } else if ($isElementNode(node)) {
                const nodeType = node.getType();
                console.log(`📍 ${indent}Element node:`, {
                  key: node.getKey(),
                  type: nodeType,
                  childrenCount: node.getChildrenSize()
                });
                
                // Traverse children in order
                const children = node.getChildren();
                for (let i = 0; i < children.length; i++) {
                  const child = children[i];
                  
                  if (traverseNodes(child, depth + 1)) {
                    return true; // Found target in a child
                  }
                  
                  // IMPORTANT: Add paragraph separator if this is a paragraph and not the last one
                  if (nodeType === 'root' && child.getType() === 'paragraph' && i < children.length - 1) {
                    globalPosition += 1; // Add 1 for paragraph separator (newline)
                    console.log(`📍 ${indent}Added paragraph separator after paragraph ${i}, new position:`, globalPosition);
                  }
                }
              }
              return false;
            };
            
            traverseNodes(root);
            
            console.log('📍 Final calculation result:', {
              nodeKey,
              offset,
              globalPosition,
              foundTarget,
              fullTextLength: fullTextContent.length,
              positionVsFullLength: `${globalPosition}/${fullTextContent.length}`
            });
            
            return foundTarget ? globalPosition : 0;
          };
          
          // Calculate proper global positions for both anchor and focus
          const globalAnchorPos = calculateGlobalPosition(anchorKey, anchorOffset);
          const globalFocusPos = calculateGlobalPosition(focusKey, focusOffset);
          
          // Debug: Let's also see what the full text content looks like
          const fullTextContent = root.getTextContent();
          console.log('🎯 Document text analysis:', {
            fullTextContent: JSON.stringify(fullTextContent),
            fullTextLength: fullTextContent.length,
            calculatedAnchorPos: globalAnchorPos,
            calculatedFocusPos: globalFocusPos,
            anchorKey,
            anchorOffset,
            focusKey,
            focusOffset
          });
          
          const anchor = textRef.current!.getCursor(globalAnchorPos);
          const focus = textRef.current!.getCursor(globalFocusPos);
          
          console.log('🎯 Creating stable cursors with proper global positions:', {
            globalAnchorPos,
            globalFocusPos,
            originalAnchorKey: anchorKey,
            originalAnchorOffset: anchorOffset,
            originalFocusKey: focusKey,
            originalFocusOffset: focusOffset
          });
          
          // Extract meaningful part from client ID
          const extractedId = clientId.includes('_') ? 
            clientId.split('_').find(part => /^\d{13}$/.test(part)) || clientId.slice(-8) : 
            clientId.slice(-8);
          
          // Store the stable node information as user metadata for more reliable transmission
          const userWithCursorData = {
            name: extractedId,
            color: clientColor || '#007acc',
            // Include stable cursor information that won't get mangled by Loro
            stableCursor: {
              anchorKey,
              anchorOffset,
              focusKey,
              focusOffset,
              timestamp: Date.now()
            }
          };
          
          awarenessRef.current!.setLocal({
            anchor,
            focus,
            user: userWithCursorData
          });
          
          console.log('🎯 Set awareness with stable cursor data:', { userWithCursorData, clientId });

          // Send ephemeral update to other clients via WebSocket
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && awarenessRef.current) {
            const ephemeralData = awarenessRef.current.encode();
            const hexData = Array.from(ephemeralData).map(b => b.toString(16).padStart(2, '0')).join('');
            
            wsRef.current.send(JSON.stringify({
              type: 'ephemeral-update',
              docId: docId,
              data: hexData  // Convert to hex string
            }));
          }
        } catch (error) {
          console.warn('Error creating cursor:', error);
        }
      }
    });
  }, [editor, clientId, clientColor, docId]);

  useEffect(() => {
    // Initialize Loro document and text object
    const doc = docRef.current;
    textRef.current = doc.getText(docId);
    
    // Only initialize awareness if it doesn't exist yet
    if (!awarenessRef.current) {
      // Initialize cursor awareness with a temporary numeric ID
      // We'll update this with the actual client ID when we receive the welcome message
      const tempNumericId = Date.now(); // Temporary ID until we get the real client ID
      peerIdRef.current = tempNumericId.toString();
      awarenessRef.current = new CursorAwareness(tempNumericId.toString() as PeerID);
      
      console.log('🎯 Initializing awareness with temporary numeric ID:', tempNumericId, '(will be updated with client ID)');
    } else {
      console.log('🎯 Awareness already exists, skipping initialization');
    }
    
    // Subscribe to awareness changes with event-aware callback
    const awarenessCallback = (_states: Map<string, any>, event?: EphemeralStoreEvent) => {
      console.log('🚨 AWARENESS CALLBACK TRIGGERED!', { 
        event: event ? {
          by: event.by,
          added: event.added,
          updated: event.updated,
          removed: event.removed
        } : 'no event',
        statesSize: _states?.size,
        timestamp: Date.now()
      });
      
      if (awarenessRef.current) {
        const allCursors = awarenessRef.current.getAll();
        const remoteCursorsData: Record<PeerID, RemoteCursor> = {};
        const currentPeerId = peerIdRef.current || clientId;
        
        console.log('👁️ Awareness callback - all cursors:', allCursors);
        console.log('👁️ Current peer ID:', currentPeerId);
        console.log('👁️ All cursor peer IDs:', Object.keys(allCursors));
        
        // Debug: Check raw ephemeral store data
        const rawStates = awarenessRef.current.getRawStates();
        console.log('👁️ Raw ephemeral store states:', rawStates);
        
        console.log('👁️ Awareness callback triggered:', {
          event: event ? {
            by: event.by,
            added: event.added,
            updated: event.updated,
            removed: event.removed
          } : 'no event',
          allCursorsKeys: Object.keys(allCursors),
          allCursorsDetail: allCursors,
          currentPeerId: currentPeerId,
          clientId: clientId
        });
        
        // CRITICAL DEBUG: Check if we have remote cursors before processing
        const remoteCursorsBefore = Object.keys(allCursors).filter(peerId => peerId !== currentPeerId);
        console.log('🔍 Remote cursors BEFORE processing:', remoteCursorsBefore);
        console.log('🔍 ALL CURSORS DATA:', allCursors);
        console.log('🔍 TOTAL CURSORS COUNT:', Object.keys(allCursors).length);
        
        // Use event information to optimize cursor processing
        let peersToProcess: string[] = [];
        if (event) {
          console.log('🔍 DETAILED EVENT ANALYSIS:', {
            eventBy: event.by,
            isImportEvent: event.by === 'import',
            isImportEventCaseInsensitive: event.by?.toLowerCase() === 'import',
            removedCount: event.removed?.length || 0,
            removedPeers: event.removed || [],
            addedCount: event.added?.length || 0,
            updatedCount: event.updated?.length || 0
          });
          
          // Check if this is a local event (our own cursor update)
          const isLocalEvent = event.by === 'local' || event.by === currentPeerId;
          const isImportEvent = event.by === 'import' || event.by?.toLowerCase() === 'import';
          
          if (isLocalEvent) {
            console.log('👁️ Local event detected - processing all cursors to ensure remote cursors remain visible');
            // For local events, process all cursors to maintain remote cursor visibility
            peersToProcess = Object.keys(allCursors);
          } else if (isImportEvent) {
            console.log('👁️ Import event detected - processing all current cursors to maintain visibility');
            // For import events, process all current cursors to maintain remote cursor visibility
            // Import events often have misleading added/updated arrays
            peersToProcess = Object.keys(allCursors);
          } else {
            console.log('👁️ Remote event detected - processing only changed peers');
            // For other remote events, process only the peers that changed
            peersToProcess = [...event.added, ...event.updated];
          }
          
          console.log('👁️ Event-driven processing - peers to process:', peersToProcess);
          
          // CRITICAL FIX: Be much more conservative about removals
          // Only remove cursors if they're not in the current allCursors AND
          // this is not an "import" event (which often has false removals)
          if (event.removed && event.removed.length > 0) {
            console.log('🔍 REMOVAL EVENT ANALYSIS:', {
              eventBy: event.by,
              isImport: event.by?.toLowerCase() === 'import',
              isImportLowercase: event.by?.toLowerCase() === 'import',
              removedPeers: event.removed,
              shouldIgnore: event.by?.toLowerCase() === 'import'
            });
            
            if (event.by?.toLowerCase() === 'import') {
              console.log('👁️ 🚫 IGNORING import-based removal events (often false positives):', event.removed);
              // Don't process removals for import events - they're usually false positives
            } else {
              console.log('👁️ Processing potential removals for peers (non-import event):', event.removed);
              
              const currentAllCursors = awarenessRef.current.getAll();
              const currentPeerIds = Object.keys(currentAllCursors);
              
              console.log('🔍 REMOVAL VALIDATION:', {
                removedPeers: event.removed,
                currentPeerIds: currentPeerIds,
                peerStillExists: event.removed.map(peerId => ({
                  peerId,
                  stillExists: currentPeerIds.includes(peerId)
                }))
              });
              
              event.removed.forEach(peerId => {
                // Only remove if the peer is truly no longer in the awareness state
                if (!currentPeerIds.includes(peerId)) {
                  console.log('👁️ ✅ Confirmed removal - peer not in current state:', peerId);
                  setRemoteCursors(prev => {
                    const updated = { ...prev };
                    delete updated[peerId as PeerID];
                    console.log('👁️ Removed peer from remote cursors:', peerId);
                    return updated;
                  });
                  
                  // Clear cursor timestamps
                  delete cursorTimestamps.current[peerId];
                } else {
                  console.log('👁️ ❌ Ignoring removal - peer still in current state:', peerId);
                }
              });
            }
          }
          
          // Don't force reprocessing of all peers, just continue with the event-driven processing
        } else {
          // No event info, process all cursors
          peersToProcess = Object.keys(allCursors);
          console.log('👁️ Full processing - all peers:', peersToProcess);
        }
        
        // Process the relevant peers
        console.log('🔍 PEER PROCESSING START:', {
          peersToProcess,
          totalPeersInAllCursors: Object.keys(allCursors).length,
          currentPeerId
        });
        
        peersToProcess.forEach(peerId => {
          const cursorData = allCursors[peerId as PeerID];
          console.log('🔍 Processing peer:', peerId, {
            hasData: !!cursorData,
            isCurrentUser: peerId === currentPeerId,
            cursorData: cursorData ? {
              hasAnchor: !!cursorData.anchor,
              hasFocus: !!cursorData.focus,
              hasUser: !!cursorData.user
            } : 'NO DATA'
          });
          
          if (!cursorData) {
            console.log('⚠️ No cursor data for peer:', peerId);
            return;
          }
          
          // Only exclude our own cursor (using current peer ID)
          if (peerId !== currentPeerId) {
            console.log('👁️ Processing remote cursor for peer:', peerId, {
              hasAnchor: !!cursorData.anchor,
              hasFocus: !!cursorData.focus,
              hasUser: !!cursorData.user,
              hasStableCursor: !!(cursorData.user as any)?.stableCursor,
              user: cursorData.user
            });
            
            let anchorPos: { key: NodeKey; offset: number; type: 'text' } | undefined;
            let focusPos: { key: NodeKey; offset: number; type: 'text' } | undefined;
            
            // Check if we have stable cursor data in user metadata (preferred)
            const stableCursor = (cursorData.user as any)?.stableCursor;
            if (stableCursor && stableCursor.anchorKey && typeof stableCursor.anchorOffset === 'number') {
              console.log('👁️ Using stable cursor data from user metadata:', stableCursor);
              
              // Validate that the node keys still exist in the current editor state
              const validAnchor = editor.getEditorState().read(() => {
                const anchorNode = $getNodeByKey(stableCursor.anchorKey);
                return !!anchorNode;
              });
              
              const validFocus = editor.getEditorState().read(() => {
                const focusNode = $getNodeByKey(stableCursor.focusKey);
                return !!focusNode;
              });
              
              if (validAnchor && validFocus) {
                anchorPos = {
                  key: stableCursor.anchorKey,
                  offset: stableCursor.anchorOffset,
                  type: 'text' as const
                };
                
                focusPos = {
                  key: stableCursor.focusKey,
                  offset: stableCursor.focusOffset,
                  type: 'text' as const
                };
                
                console.log('👁️ Successfully used stable cursor data:', { anchorPos, focusPos });
              } else {
                console.log('👁️ Stable cursor nodes no longer valid, creating intelligent fallback position');
                
                // IMPROVED: Instead of trying LORO conversion (which we skip), create smart fallback
                const fallbackPosition = editor.getEditorState().read(() => {
                  // Use the improved fallback logic that maintains relative position
                  const referencePosition = {
                    anchorKey: stableCursor.anchorKey,
                    anchorOffset: stableCursor.anchorOffset
                  };
                  
                  console.log('👁️ Using reference position for smart fallback after stable cursor invalidation:', referencePosition);
                  
                  const root = $getRoot();
                  
                  // BETTER STRATEGY: Try to find which paragraph/element the original cursor was in
                  // and place the fallback cursor in a similar paragraph
                  
                  const fullDocumentText = root.getTextContent();
                  console.log('👁️ Full document text for position calculation:', {
                    text: JSON.stringify(fullDocumentText),
                    length: fullDocumentText.length
                  });
                  
                  // Step 1: Collect all paragraphs/text nodes with their positions
                  const textNodesInfo: Array<{
                    node: LexicalNode;
                    key: string;
                    text: string;
                    globalStartPos: number;
                    globalEndPos: number;
                    paragraphIndex: number;
                  }> = [];
                  
                  let currentGlobalPos = 0;
                  let paragraphIndex = 0;
                  
                  const collectParagraphInfo = (node: LexicalNode): void => {
                    if ($isTextNode(node)) {
                      const textContent = node.getTextContent();
                      const textLength = textContent.length;
                      
                      textNodesInfo.push({
                        node,
                        key: node.getKey(),
                        text: textContent,
                        globalStartPos: currentGlobalPos,
                        globalEndPos: currentGlobalPos + textLength,
                        paragraphIndex: paragraphIndex
                      });
                      
                      currentGlobalPos += textLength;
                    } else if ($isElementNode(node)) {
                      const nodeType = node.getType();
                      const isParagraph = nodeType === 'paragraph' || nodeType === 'heading';
                      
                      if (isParagraph && textNodesInfo.length > 0) {
                        paragraphIndex++; // New paragraph
                      }
                      
                      const children = node.getChildren();
                      children.forEach(child => collectParagraphInfo(child));
                      
                      // Handle paragraph breaks (newlines between paragraphs)
                      if (isParagraph && children.length > 0) {
                        // Check if this paragraph is followed by another paragraph
                        const parent = node.getParent();
                        if (parent && $isElementNode(parent)) {
                          const siblings = parent.getChildren();
                          const currentIndex = siblings.indexOf(node);
                          if (currentIndex < siblings.length - 1) {
                            const nextSibling = siblings[currentIndex + 1];
                            if ($isElementNode(nextSibling) && 
                                (nextSibling.getType() === 'paragraph' || nextSibling.getType() === 'heading')) {
                              // Add newline characters between paragraphs
                              currentGlobalPos += 2; // Typical paragraph break
                            }
                          }
                        }
                      }
                    }
                  };
                  
                  collectParagraphInfo(root);
                  
                  console.log('👁️ Document structure analysis:', {
                    totalParagraphs: Math.max(...textNodesInfo.map(info => info.paragraphIndex)) + 1,
                    textNodesInfo: textNodesInfo.map(info => ({
                      key: info.key,
                      text: info.text.substring(0, 20) + (info.text.length > 20 ? '...' : ''),
                      globalRange: `${info.globalStartPos}-${info.globalEndPos}`,
                      paragraphIndex: info.paragraphIndex
                    }))
                  });
                  
                  // Step 2: Try to determine which paragraph the original cursor was likely in
                  // Look for a node with the same key first
                  let originalParagraphIndex = 0;
                  const originalNodeInfo = textNodesInfo.find(info => info.key === referencePosition.anchorKey);
                  
                  if (originalNodeInfo) {
                    originalParagraphIndex = originalNodeInfo.paragraphIndex;
                    console.log('👁️ Found original node in document structure:', {
                      originalKey: referencePosition.anchorKey,
                      paragraphIndex: originalParagraphIndex,
                      text: originalNodeInfo.text.substring(0, 30)
                    });
                  } else {
                    // If we can't find the exact node, estimate based on paragraph count and offset
                    const totalParagraphs = Math.max(...textNodesInfo.map(info => info.paragraphIndex)) + 1;
                    const originalOffset = referencePosition.anchorOffset;
                    
                    if (originalOffset <= 5 && totalParagraphs > 1) {
                      originalParagraphIndex = 0; // Likely first paragraph
                    } else if (originalOffset <= 15 && totalParagraphs > 2) {
                      originalParagraphIndex = Math.min(1, totalParagraphs - 1); // Likely second paragraph
                    } else if (totalParagraphs > 1) {
                      // Likely later paragraph
                      originalParagraphIndex = Math.min(Math.floor(totalParagraphs * 0.5), totalParagraphs - 1);
                    }
                    
                    console.log('👁️ Estimated original paragraph based on offset:', {
                      originalOffset,
                      totalParagraphs,
                      estimatedParagraphIndex: originalParagraphIndex
                    });
                  }
                  
                  // Step 3: Find a text node in the same or similar paragraph
                  let targetNodeInfo = textNodesInfo.find(info => info.paragraphIndex === originalParagraphIndex);
                  
                  // If no node in the target paragraph, use adjacent paragraphs
                  if (!targetNodeInfo) {
                    // Try paragraph before or after
                    targetNodeInfo = textNodesInfo.find(info => 
                      Math.abs(info.paragraphIndex - originalParagraphIndex) <= 1
                    );
                  }
                  
                  // If still no match, use first available
                  if (!targetNodeInfo && textNodesInfo.length > 0) {
                    targetNodeInfo = textNodesInfo[0];
                  }
                  
                  if (targetNodeInfo) {
                    const originalOffset = referencePosition.anchorOffset;
                    const textLength = targetNodeInfo.text.length;
                    
                    // Calculate proportional offset within the target text node
                    let targetOffset = 0;
                    if (originalOffset <= 5) {
                      targetOffset = Math.min(Math.max(1, originalOffset), textLength);
                    } else if (originalOffset <= 15) {
                      targetOffset = Math.min(Math.floor(textLength * 0.3), textLength);
                    } else {
                      targetOffset = Math.min(Math.floor(textLength * 0.5), textLength);
                    }
                    
                    console.log('👁️ Applied paragraph-aware fallback (preserves Y-axis):', {
                      nodeKey: targetNodeInfo.key,
                      offset: targetOffset,
                      originalOffset: originalOffset,
                      originalParagraphIndex: originalParagraphIndex,
                      targetParagraphIndex: targetNodeInfo.paragraphIndex,
                      targetText: targetNodeInfo.text.substring(0, 30) + '...',
                      nodeLength: textLength
                    });
                    
                    return {
                      key: targetNodeInfo.key,
                      offset: targetOffset,
                      type: 'text' as const
                    };
                  }
                  
                  // Ultimate fallback to root
                  console.log('👁️ Using root as ultimate fallback');
                  return {
                    key: root.getKey(),
                    offset: 0,
                    type: 'text' as const
                  };
                });
                
                anchorPos = fallbackPosition;
                focusPos = fallbackPosition; // Same position for both anchor and focus
                console.log('👁️ Applied intelligent fallback positions:', { anchorPos, focusPos });
              }
            } else {
              console.log('👁️ No stable cursor data available, creating smart fallback positions');
              
              // Instead of trying LORO cursor conversion (which we skip), create immediate fallback
              const smartFallbackPosition = editor.getEditorState().read(() => {
                const root = $getRoot();
                const children = root.getChildren();
                
                // Find the first available text node
                for (const child of children) {
                  if ($isElementNode(child)) {
                    const grandChildren = child.getChildren();
                    for (const grandChild of grandChildren) {
                      if ($isTextNode(grandChild)) {
                        console.log('👁️ Using first available text node for cursor:', {
                          nodeKey: grandChild.getKey(),
                          textContent: grandChild.getTextContent().substring(0, 30)
                        });
                        return {
                          key: grandChild.getKey(),
                          offset: Math.min(5, grandChild.getTextContent().length), // Small offset from start
                          type: 'text' as const
                        };
                      }
                    }
                  }
                }
                
                // Fallback to root if no text nodes found
                console.log('👁️ No text nodes found, using root as fallback');
                return {
                  key: root.getKey(),
                  offset: 0,
                  type: 'text' as const
                };
              });
              
              anchorPos = smartFallbackPosition;
              focusPos = smartFallbackPosition;
              console.log('👁️ Applied smart fallback for no stable cursor data:', { anchorPos, focusPos });
            }
            
            console.log('👁️ Converted positions for peer:', peerId, {
              anchorPos,
              focusPos
            });
            
            // CRITICAL: Ensure we always have valid anchor and focus positions
            if (!anchorPos || !focusPos) {
              console.log('🚨 Missing anchor or focus position, creating smart fallback for peer:', peerId);
              
              // Try to use the stored stable cursor as reference for finding a similar position
              let referencePosition: { anchorKey: string; anchorOffset: number } | null = null;
              if (stableCursor && stableCursor.anchorKey && typeof stableCursor.anchorOffset === 'number') {
                referencePosition = {
                  anchorKey: stableCursor.anchorKey,
                  anchorOffset: stableCursor.anchorOffset
                };
              }
              
              const smartPosition = editor.getEditorState().read(() => {
                const root = $getRoot();
                
                // If we have a reference position, calculate the global document position
                // and try to find a position that maintains the same relative location
                if (referencePosition) {
                  console.log('🔄 Using reference position for smart fallback:', referencePosition);
                  
                  // First, try to find the exact same node (it might still exist)
                  let targetNode: LexicalNode | null = null;
                  const findExactNode = (node: LexicalNode): boolean => {
                    if (node.getKey() === referencePosition!.anchorKey) {
                      targetNode = node;
                      return true;
                    }
                    if ($isElementNode(node)) {
                      const nodeChildren = node.getChildren();
                      for (const child of nodeChildren) {
                        if (findExactNode(child)) {
                          return true;
                        }
                      }
                    }
                    return false;
                  };
                  
                  findExactNode(root);
                  
                  if (targetNode && $isTextNode(targetNode)) {
                    const textNode = targetNode as any;
                    const textLength = textNode.getTextContent().length;
                    const safeOffset = Math.min(referencePosition.anchorOffset, textLength);
                    console.log('🔄 Found exact node still exists:', {
                      nodeKey: textNode.getKey(),
                      offset: safeOffset
                    });
                    return {
                      key: textNode.getKey(),
                      offset: safeOffset,
                      type: 'text' as const
                    };
                  }
                  
                  // If exact node not found, we need to calculate the global position
                  // that this cursor was at and find the equivalent position in the new tree
                  console.log('🔄 Exact node not found, calculating global position equivalent');
                  
                  // Instead of guessing, let's calculate where this cursor should be
                  // based on the current document structure
                  const fullDocumentText = root.getTextContent();
                  console.log('🔄 Full document text for position calculation:', {
                    text: JSON.stringify(fullDocumentText),
                    length: fullDocumentText.length
                  });
                  
                  // Calculate a reasonable position: try to maintain the same relative position
                  // For a simple approach, let's use the offset as a ratio of the original node length
                  // and apply that ratio to a reasonable position in the current document
                  
                  // Find a good text node to place the cursor in
                  let bestFallbackNode: LexicalNode | null = null;
                  let bestFallbackOffset = 0;
                  
                  const findBestFallbackPosition = (node: LexicalNode): void => {
                    if ($isTextNode(node)) {
                      const textContent = node.getTextContent();
                      const textLength = textContent.length;
                      
                      if (textLength > 0 && !bestFallbackNode) {
                        bestFallbackNode = node;
                        // Use a reasonable offset: if original offset was small, use small offset
                        // if original offset was large relative to typical text, use larger offset
                        const originalOffset = referencePosition!.anchorOffset;
                        if (originalOffset <= 5) {
                          // Original was near start, place near start
                          bestFallbackOffset = Math.min(originalOffset, textLength);
                        } else {
                          // Original was further in, place proportionally
                          bestFallbackOffset = Math.min(Math.floor(textLength * 0.3), textLength);
                        }
                      }
                    } else if ($isElementNode(node)) {
                      const nodeChildren = node.getChildren();
                      for (const child of nodeChildren) {
                        findBestFallbackPosition(child);
                      }
                    }
                  };
                  
                  findBestFallbackPosition(root);
                  
                  if (bestFallbackNode && $isTextNode(bestFallbackNode)) {
                    const textNode = bestFallbackNode as any;
                    const textLength = textNode.getTextContent().length;
                    const safeOffset = Math.min(bestFallbackOffset, textLength);
                    console.log('🔄 Found proportional fallback position:', {
                      nodeKey: textNode.getKey(),
                      offset: safeOffset,
                      originalOffset: referencePosition.anchorOffset,
                      nodeLength: textLength
                    });
                    return {
                      key: textNode.getKey(),
                      offset: safeOffset,
                      type: 'text' as const
                    };
                  }
                }
                
                // If no reference position or position calculation failed,
                // fallback to a reasonable default position (not beginning of document)
                console.log('🔄 No reference position or calculation failed, using safe fallback');
                
                // Find the first text node with some content
                const findFirstTextNode = (node: LexicalNode): LexicalNode | null => {
                  if ($isTextNode(node) && node.getTextContent().length > 0) {
                    return node;
                  }
                  if ($isElementNode(node)) {
                    const nodeChildren = node.getChildren();
                    for (const child of nodeChildren) {
                      const result = findFirstTextNode(child);
                      if (result) return result;
                    }
                  }
                  return null;
                };
                
                const firstTextNode = findFirstTextNode(root);
                if (firstTextNode && $isTextNode(firstTextNode)) {
                  const textNode = firstTextNode as any;
                  // Place cursor at a reasonable position, not at the very beginning
                  const textLength = textNode.getTextContent().length;
                  const offset = Math.min(1, textLength); // Position 1 or end if shorter
                  console.log('🔄 Using reasonable position in first text node as fallback:', {
                    nodeKey: textNode.getKey(),
                    offset: offset,
                    textLength: textLength
                  });
                  return {
                    key: textNode.getKey(),
                    offset: offset,
                    type: 'text' as const
                  };
                }
                
                // Ultimate fallback to root
                console.log('🔄 Ultimate emergency fallback to root');
                return {
                  key: root.getKey(),
                  offset: 0,
                  type: 'text' as const
                };
              });
              
              anchorPos = anchorPos || smartPosition;
              focusPos = focusPos || smartPosition;
              console.log('🔄 Applied smart fallback positions:', { anchorPos, focusPos });
            }
            
            remoteCursorsData[peerId as PeerID] = {
              peerId: peerId as PeerID,
              anchor: anchorPos,
              focus: focusPos,
              user: cursorData.user
            };
          } else {
            console.log('👁️ Skipping own cursor for peer:', peerId);
          }
        });
        
        console.log('🔍 PEER PROCESSING END:', {
          remoteCursorsDataKeys: Object.keys(remoteCursorsData),
          remoteCursorsDataCount: Object.keys(remoteCursorsData).length,
          originalAllCursorsKeys: Object.keys(allCursors),
          currentPeerId,
          peersProcessed: peersToProcess
        });
        
        console.log('🎯 Setting remote cursors:', remoteCursorsData);
        console.log('🔢 Remote cursors count after processing:', Object.keys(remoteCursorsData).length);
        
        if (Object.keys(remoteCursorsData).length === 0) {
          console.log('💡 No remote cursors to display. Open another browser tab to see collaborative cursors!');
        }
        
        // Update cursor timestamps for activity tracking
        const now = Date.now();
        Object.keys(remoteCursorsData).forEach(peerId => {
          cursorTimestamps.current[peerId] = now;
        });
        
        setRemoteCursors(remoteCursorsData);
        
        // Call awareness change callback for UI display (include ALL users, including self)
        if (stableOnAwarenessChange.current) {
          const awarenessData = Object.keys(allCursors).map(peerId => {
            // Extract meaningful part from peer ID
            const extractedId = peerId.includes('_') ? 
              peerId.split('_').find(part => /^\d{13}$/.test(part)) || peerId.slice(-8) : 
              peerId.slice(-8);
            
            const isCurrentUser = peerId === currentPeerId;
            
            return {
              peerId: peerId,
              userName: allCursors[peerId as PeerID]?.user?.name || extractedId,
              isCurrentUser: isCurrentUser
            };
          });
          stableOnAwarenessChange.current(awarenessData);
        }
        
        // Force cursor re-render when remote cursors change
        setForceUpdate(prev => prev + 1);
      }
    };
    
    // Only add the listener if this is a new awareness instance
    const currentAwareness = awarenessRef.current;
    if (currentAwareness) {
      // Remove any existing listeners first to prevent duplicates
      currentAwareness.removeListener(awarenessCallback);
      // Add the new listener
      currentAwareness.addListener(awarenessCallback);
      console.log('🎯 Added awareness callback listener');
    }
    
    // Set up the remote cursor callback
    awarenessRef.current.setRemoteCursorCallback((peerId: PeerID, cursor: RemoteCursor) => {
      console.log('🎯 Remote cursor callback triggered:', peerId, cursor);
      setRemoteCursors(prev => {
        const updated = {
          ...prev,
          [peerId]: cursor
        };
        console.log('🎯 Updated remote cursors state:', updated);
        // Force cursor re-render
        setForceUpdate(updateVal => updateVal + 1);
        return updated;
      });
    });
    
    // Subscribe to Loro document changes
    const unsubscribe = doc.subscribe(() => {
      if (!isLocalChange.current) {
        // This is a remote change, update Lexical editor
        const currentText = textRef.current?.toString() || '';
        updateLexicalFromLoro(editor, currentText);
      }
      // Force cursor re-render when document changes (content affects cursor positioning)
      setForceUpdate(prev => prev + 1);
    });

    // Subscribe to Lexical editor changes with debouncing
    let updateTimeout: NodeJS.Timeout | null = null;
    const removeEditorListener = editor.registerUpdateListener(({ editorState, tags }) => {
      // Skip if this is a local change from our plugin
      if (isLocalChange.current || tags.has('collaboration')) return;
      
      // Clear previous timeout
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      
      // Debounce updates to prevent rapid firing
      updateTimeout = setTimeout(() => {
        if (!isLocalChange.current) {
          updateLoroFromLexical(editorState);
        }
      }, 25); // 25ms debounce for better responsiveness
    });

    return () => {
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      if (awarenessRef.current) {
        awarenessRef.current.removeListener(awarenessCallback);
        console.log('🎯 Removed awareness callback listener');
      }
      unsubscribe();
      removeEditorListener();
    };
  }, [editor, docId, updateLoroFromLexical, updateLexicalFromLoro, clientId]);

  // Connection retry state
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 5;

  // Create stable refs for callbacks to avoid dependency issues
  const stableOnAwarenessChange = useRef(onAwarenessChange);
  stableOnAwarenessChange.current = onAwarenessChange;

  // WebSocket connection management with stable dependencies
  const stableOnConnectionChange = useRef(onConnectionChange);
  const stableOnDisconnectReady = useRef(onDisconnectReady);
  
  // Update refs when props change without triggering effect
  useEffect(() => {
    stableOnConnectionChange.current = onConnectionChange;
    stableOnDisconnectReady.current = onDisconnectReady;
  });

  useEffect(() => {
    // Close any existing connection before creating a new one
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    const connectWebSocket = () => {
      // Prevent multiple connections
      if (isConnectingRef.current || (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) {
        return;
      }
      
      try {
        isConnectingRef.current = true;
        const ws = new WebSocket(websocketUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          isConnectingRef.current = false;
          retryCountRef.current = 0; // Reset retry count on successful connection
          console.log('🔗 Lexical editor connected to WebSocket server');
          stableOnConnectionChange.current?.(true);
          
          // Provide disconnect function to parent component
          const disconnectFn = () => {
            if (wsRef.current) {
              wsRef.current.close();
              stableOnConnectionChange.current?.(false);
            }
          };
          stableOnDisconnectReady.current?.(disconnectFn);
        };

        ws.onmessage = (event) => {
          try {
            const data: LoroMessage = JSON.parse(event.data);
            
            // Log ALL incoming messages for debugging
            console.log('📥 Received WebSocket message:', {
              type: data.type,
              docId: data.docId,
              hasData: !!data.data,
              hasEvent: !!data.event,
              clientId: data.clientId,
              messageSize: event.data.length
            });
            
            if (data.type === 'loro-update' && data.docId === docId) {
              // Apply remote update to local document
              const update = new Uint8Array(data.update!);
              docRef.current.import(update);
            } else if (data.type === 'initial-snapshot' && data.docId === docId) {
              // Apply initial snapshot from server
              const snapshot = new Uint8Array(data.snapshot!);
              docRef.current.import(snapshot);
              hasReceivedInitialSnapshot.current = true;
              console.log('📄 Lexical editor received and applied initial snapshot');
            } else if (data.type === 'ephemeral-update' || data.type === 'ephemeral-event') {
              // Handle ephemeral updates from other clients using EphemeralStore
              if (data.docId === docId && data.data) {
                try {
                  console.log('📡 Received ephemeral update:', {
                    type: data.type,
                    event: data.event || 'legacy',
                    hasEventInfo: !!data.event,
                    eventDetails: data.event
                  });
                  
                  // Convert hex string back to Uint8Array
                  const ephemeralBytes = new Uint8Array(
                    data.data.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
                  );
                  
                  if (awarenessRef.current && ephemeralBytes.length > 0) {
                    console.log('🎯 About to apply ephemeral data, current state before apply:');
                    console.log('🎯 Current awareness data before apply:', awarenessRef.current.getAll());
                    
                    // Apply the ephemeral data to our local store
                    // This will now automatically trigger the awareness callback
                    awarenessRef.current.apply(ephemeralBytes);
                    
                    console.log('🎯 Current awareness data after apply:', awarenessRef.current.getAll());
                    
                    // Process ephemeral event - the awareness callback handles cursor updates
                    console.log('🎯 Processing ephemeral event with details:', {
                      by: data.event?.by,
                      added: data.event?.added,
                      updated: data.event?.updated,
                      removed: data.event?.removed
                    });
                    
                    // CRITICAL FIX: Don't immediately remove cursors on ephemeral events
                    // The typing action often triggers false "removal" events
                    // Let the awareness callback handle cursor state properly
                    if (data.event?.removed && data.event.removed.length > 0) {
                      console.log('�️ Note: Ephemeral event indicates removals:', data.event.removed, '(will be validated by awareness callback)');
                      // Don't immediately remove cursors - let the awareness callback validate
                    }
                    
                    console.log('👁️ Applied ephemeral update from remote clients');
                  }
                } catch (error) {
                  console.warn('Error applying ephemeral update:', error);
                }
              }
            } else if (data.type === 'welcome') {
              console.log('👋 Lexical editor welcome message received', {
                clientId: data.clientId,
                color: data.color
              });
              
              // Set client ID and color for cursor tracking
              setClientId(data.clientId || '');
              setClientColor(data.color || '');
              
                // Update the numeric peer ID to use the client ID for consistency
                if (data.clientId && awarenessRef.current) {
                  // Store the client ID as the peer ID
                  peerIdRef.current = data.clientId;
                  
                  // Create a new CursorAwareness instance with the client ID as peer ID
                  awarenessRef.current = new CursorAwareness(data.clientId as PeerID);
                  
                  console.log('🎯 Updated awareness to use client ID as peer ID:', data.clientId);
                  
                  // Extract meaningful part from client ID
                  const extractedId = data.clientId.includes('_') ? 
                    data.clientId.split('_').find(part => /^\d{13}$/.test(part)) || data.clientId.slice(-8) : 
                    data.clientId.slice(-8);
                  
                  // We'll re-add the awareness callback in the main useEffect
                  // Update awareness with client info using the client ID
                  awarenessRef.current.setLocal({
                    user: { name: extractedId, color: data.color || '#007acc' }
                  });
                  console.log('🎯 Updated awareness with WebSocket client ID user data:', { name: extractedId, color: data.color || '#007acc', clientId: data.clientId });
                }              // Notify parent component of the peerId
              if (onPeerIdChange && data.clientId) {
                onPeerIdChange(data.clientId);
              }
              
              // Request current snapshot from server after a small delay
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'request-snapshot',
                    docId: docId
                  }));
                  console.log('📞 Lexical editor requested current snapshot from server');
                }
              }, 150); // Slightly different delay than text editor
            } else if (data.type === 'snapshot-request' && data.docId === docId) {
              // Another client is requesting a snapshot, send ours if we have content
              editor.getEditorState().read(() => {
                const currentText = $getRoot().getTextContent();
                if (currentText.length > 0) {
                  const snapshot = docRef.current.exportSnapshot();
                  ws.send(JSON.stringify({
                    type: 'snapshot',
                    snapshot: Array.from(snapshot),
                    docId: docId
                  }));
                  console.log('📄 Lexical editor sent snapshot in response to request');
                }
              });
            } else if (data.type === 'client-disconnect') {
              // Handle explicit client disconnect notifications
              console.log('📢 Received client disconnect notification:', data);
              const disconnectedClientId = data.clientId;
              
              if (disconnectedClientId && awarenessRef.current) {
                console.log('🧹 Forcing cleanup of disconnected client:', disconnectedClientId);
                
                // Remove from remote cursors immediately
                setRemoteCursors(prev => {
                  const updated = { ...prev };
                  console.log('🧹 Current remote cursors before cleanup:', prev);
                  delete updated[disconnectedClientId as PeerID];
                  console.log('🧹 Removed disconnected client from remote cursors, new state:', updated);
                  return updated;
                });
                
                // Clear from timestamps
                delete cursorTimestamps.current[disconnectedClientId];
                
                // Force awareness refresh
                setForceUpdate(prev => prev + 1);
                
                console.log('🧹 Completed immediate cleanup for disconnected client');
              } else {
                console.warn('🧹 Cannot cleanup - missing client ID or awareness ref');
              }
            }
          } catch (err) {
            console.error('Error processing WebSocket message in Lexical plugin:', err);
          }
        };

        ws.onclose = () => {
          isConnectingRef.current = false;
          console.log('📴 Lexical editor disconnected from WebSocket server');
          stableOnConnectionChange.current?.(false);
          
          // Clear any existing retry timeout
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }
          
          // Only retry if we haven't exceeded max retries
          if (retryCountRef.current < maxRetries) {
            const retryDelay = Math.min(1000 * Math.pow(2, retryCountRef.current), 10000); // Exponential backoff, max 10s
            retryCountRef.current++;
            console.log(`🔄 Retrying connection in ${retryDelay}ms (attempt ${retryCountRef.current}/${maxRetries})`);
            
            retryTimeoutRef.current = setTimeout(connectWebSocket, retryDelay);
          } else {
            console.log('❌ Max connection retries exceeded, giving up');
          }
        };

        ws.onerror = (err) => {
          isConnectingRef.current = false;
          console.error('WebSocket error in Lexical plugin:', err);
        };

      } catch (err) {
        isConnectingRef.current = false;
        console.error('Failed to connect to WebSocket server in Lexical plugin:', err);
      }
    };

    connectWebSocket();

    return () => {
      // Clear retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [websocketUrl, docId, editor, onPeerIdChange]); // Include all dependencies

  // Cleanup stale cursors periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 10000; // 10 seconds
      
      setRemoteCursors(prev => {
        const updated = { ...prev };
        let hasChanges = false;
        
        Object.keys(updated).forEach(peerId => {
          const lastSeen = cursorTimestamps.current[peerId] || 0;
          if (now - lastSeen > staleThreshold) {
            console.log('🧹 Removing stale cursor for peer:', peerId, 'last seen:', now - lastSeen, 'ms ago');
            delete updated[peerId as PeerID];
            delete cursorTimestamps.current[peerId];
            hasChanges = true;
          }
        });
        
        return hasChanges ? updated : prev;
      });
    }, 2000); // Check every 2 seconds
    
    return () => clearInterval(cleanupInterval);
  }, []);

  // Track selection changes for collaborative cursors using Awareness
  useEffect(() => {
    // Listen to both content changes AND selection changes
    const removeUpdateListener = editor.registerUpdateListener(({ editorState }) => {
      // Always update cursor awareness on any state change (content or selection)
      editorState.read(() => {
        updateCursorAwareness();
      });
    });

    // Add DOM event listeners to track cursor movements
    const editorElement = editor.getElementByKey('root');
    const editorContainer = editorElement?.closest('[contenteditable]') as HTMLElement;
    
    if (editorContainer) {
      // Listen for mouse clicks that change cursor position
      const handleClick = () => {
        // Small delay to ensure selection has updated
        setTimeout(() => {
          updateCursorAwareness();
        }, 10);
      };

      // Listen for keyboard events that change cursor position
      const handleKeyboard = (event: KeyboardEvent) => {
        // Check for cursor movement keys OR typing keys
        const cursorKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
        const isTyping = event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete';
        
        if (cursorKeys.includes(event.key) || isTyping) {
          // Small delay to ensure selection has updated
          setTimeout(() => {
            updateCursorAwareness();
          }, 10);
        }
      };

      // Listen for global selection changes
      const handleSelectionChange = () => {
        // Check if the current selection is within our editor
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (editorContainer.contains(range.commonAncestorContainer)) {
            updateCursorAwareness();
          }
        }
      };

      editorContainer.addEventListener('click', handleClick);
      editorContainer.addEventListener('keyup', handleKeyboard);
      document.addEventListener('selectionchange', handleSelectionChange);

      // Periodic cursor refresh to keep cursor alive in EphemeralStore
      // Send cursor update every 60 seconds to prevent timeout
      const cursorRefreshInterval = setInterval(() => {
        updateCursorAwareness();
      }, 60_000); // Every 60 seconds

      return () => {
        clearInterval(cursorRefreshInterval);
        removeUpdateListener();
        editorContainer.removeEventListener('click', handleClick);
        editorContainer.removeEventListener('keyup', handleKeyboard);
        document.removeEventListener('selectionchange', handleSelectionChange);
      };
    }

    return removeUpdateListener;
  }, [editor, updateCursorAwareness]);

  // Force cursor re-rendering when remote cursors change
  useEffect(() => {
    // This effect will trigger whenever forceUpdate changes
    console.log('🔄 Forcing cursor re-render due to remote cursor changes');
  }, [forceUpdate]);

  // Get the Lexical editor element and its parent for overlay positioning
  const getEditorElement = useCallback(() => {
    const editorContainer = editor.getElementByKey('root');
    return editorContainer?.closest('[contenteditable]') as HTMLElement | null;
  }, [editor]);

  // Calculate DOM position from Lexical node position (using Lexical's approach)
  const getPositionFromLexicalPosition = useCallback((nodeKey: NodeKey, offset: number) => {
    const editorElement = getEditorElement();
    if (!editorElement) {
      console.warn('🚨 No editor element for cursor positioning');
      // Return position far off-screen so validation will skip it
      return { top: -1000, left: -1000 };
    }

    try {
      return editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey);
        if (!node) {
          console.warn('🚨 Node not found for key:', nodeKey);
          return { top: -1000, left: -1000 };
        }

        console.log('🎯 Calculating position for node:', {
          nodeKey,
          offset,
          nodeType: node.getType(),
          isTextNode: $isTextNode(node),
          isElementNode: $isElementNode(node),
          isLineBreakNode: $isLineBreakNode(node),
          textContent: $isTextNode(node) ? node.getTextContent() : 'N/A'
        });

        // CRITICAL FIX: Force layout update before position calculation
        // This ensures we get accurate positions after typing changes
        const forceLayoutUpdate = () => {
          const editorEl = editor.getRootElement();
          if (editorEl) {
            // Force a synchronous layout by reading layout properties
            void editorEl.offsetHeight; // Forces reflow
            void editorEl.offsetWidth;  // Forces reflow
          }
        };
        
        forceLayoutUpdate();

        // Handle line break nodes specially (like Lexical does)
        if ($isLineBreakNode(node)) {
          const brElement = editor.getElementByKey(nodeKey) as HTMLElement;
          if (brElement) {
            // Force fresh layout calculation for line breaks
            void brElement.offsetHeight;
            const brRect = brElement.getBoundingClientRect();
            console.log('📏 Line break node position:', { top: brRect.top, left: brRect.left });
            return {
              top: brRect.top,
              left: brRect.left
            };
          }
        }

        // For element nodes (like root, paragraph), we need to find the text position within
        if ($isElementNode(node)) {
          console.log('🏗️ Element node, finding text position at offset:', offset);
          
          // Get all children and find the text position
          const children = node.getChildren();
          let currentOffset = 0;
          let targetNode = null;
          let targetOffset = 0;

          for (let i = 0; i < children.length; i++) {
            const child = children[i];
            
            if ($isTextNode(child)) {
              const textLength = child.getTextContentSize();
              console.log('📝 Found text node:', { 
                key: child.getKey(), 
                textLength, 
                currentOffset, 
                targetOffset: offset 
              });
              
              if (currentOffset + textLength >= offset) {
                // Found the target text node
                targetNode = child;
                targetOffset = offset - currentOffset;
                console.log('🎯 Target found in text node:', { 
                  targetNodeKey: targetNode.getKey(), 
                  targetOffset 
                });
                break;
              }
              currentOffset += textLength;
            } else if ($isElementNode(child)) {
              // For element children, count as 1 position
              console.log('🏗️ Found element node:', { 
                key: child.getKey(), 
                currentOffset, 
                targetOffset: offset 
              });
              
              if (currentOffset + 1 > offset) {
                targetNode = child;
                targetOffset = 0;
                console.log('🎯 Target found at element node:', { 
                  targetNodeKey: targetNode.getKey(), 
                  targetOffset 
                });
                break;
              }
              currentOffset += 1;
            } else {
              // Other node types (decorators, etc.)
              if (currentOffset + 1 > offset) {
                targetNode = child;
                targetOffset = 0;
                break;
              }
              currentOffset += 1;
            }
          }

          // If we didn't find a specific target, use the last available position
          if (!targetNode && children.length > 0) {
            const lastChild = children[children.length - 1];
            if ($isTextNode(lastChild)) {
              targetNode = lastChild;
              targetOffset = lastChild.getTextContentSize();
              console.log('🔚 Using last text node position:', { 
                targetNodeKey: targetNode.getKey(), 
                targetOffset 
              });
            } else {
              targetNode = lastChild;
              targetOffset = 0;
              console.log('🔚 Using last element node:', { 
                targetNodeKey: targetNode.getKey(), 
                targetOffset 
              });
            }
          }

          // If we found a target node, use it for positioning
          if (targetNode) {
            console.log('🎯 Processing target node:', {
              targetNodeKey: targetNode.getKey(),
              targetOffset,
              isTextNode: $isTextNode(targetNode),
              isElementNode: $isElementNode(targetNode)
            });

            // If target is a text node, use it directly
            if ($isTextNode(targetNode)) {
              try {
                const range = createDOMRange(
                  editor,
                  targetNode,
                  targetOffset,
                  targetNode,
                  targetOffset
                );

                if (range !== null) {
                  const rects = createRectsFromDOMRange(editor, range);
                  if (rects.length > 0) {
                    const rect = rects[0];
                    
                    // Get editor element bounds for debugging
                    const editorElement = editor.getRootElement();
                    const editorBounds = editorElement ? editorElement.getBoundingClientRect() : null;
                    
                    console.log('📐 Text node range position:', { 
                      top: rect.top, 
                      left: rect.left,
                      targetNodeKey: targetNode.getKey(),
                      targetOffset,
                      editorBounds: editorBounds ? { 
                        top: editorBounds.top, 
                        left: editorBounds.left, 
                        width: editorBounds.width, 
                        height: editorBounds.height 
                      } : null,
                      rectRelativeToEditor: editorBounds ? {
                        top: rect.top - editorBounds.top,
                        left: rect.left - editorBounds.left
                      } : null
                    });
                    console.log('📐 Target text node range position:', { 
                      top: rect.top, 
                      left: rect.left,
                      targetNodeKey: targetNode.getKey(),
                      targetOffset
                    });
                    
                    return {
                      top: rect.top,
                      left: rect.left
                    };
                  }
                }
              } catch (error) {
                console.warn('🚨 Error creating range for target text node:', error);
              }
            }

            // If target is an element node, try to find first text node within it
            if ($isElementNode(targetNode)) {
              console.log('🏗️ Target is element, looking for text within it');
              const targetChildren = targetNode.getChildren();
              let firstTextNode = null;

              for (const child of targetChildren) {
                if ($isTextNode(child)) {
                  firstTextNode = child;
                  console.log('📝 Found first text node in target element:', child.getKey());
                  break;
                }
              }

              if (firstTextNode) {
                try {
                  const range = createDOMRange(
                    editor,
                    firstTextNode,
                    0, // Start of first text node
                    firstTextNode,
                    0
                  );

                  if (range !== null) {
                    const rects = createRectsFromDOMRange(editor, range);
                    if (rects.length > 0) {
                      const rect = rects[0];
                      // Get editor element bounds for debugging
                      const editorElement = editor.getRootElement();
                      const editorBounds = editorElement ? editorElement.getBoundingClientRect() : null;
                      
                      console.log('📐 Target element->text range position:', { 
                        top: rect.top, 
                        left: rect.left,
                        targetNodeKey: targetNode.getKey(),
                        firstTextNodeKey: firstTextNode.getKey(),
                        editorBounds: editorBounds ? { 
                          top: editorBounds.top, 
                          left: editorBounds.left, 
                          width: editorBounds.width, 
                          height: editorBounds.height 
                        } : null,
                        rectRelativeToEditor: editorBounds ? {
                          top: rect.top - editorBounds.top,
                          left: rect.left - editorBounds.left
                        } : null
                      });
                      
                      return {
                        top: rect.top,
                        left: rect.left
                      };
                    }
                  }
                } catch (error) {
                  console.warn('🚨 Error creating range for text within target element:', error);
                }
              } else {
                // No text nodes in element, use element position directly
                console.log('📦 No text in target element, using element position');
                const domElement = editor.getElementByKey(targetNode.getKey());
                if (domElement) {
                  const elementRect = domElement.getBoundingClientRect();
                  return {
                    top: elementRect.top,
                    left: elementRect.left
                  };
                }
              }
            }
          }

          // Fallback to element position if we can't create a range
          console.log('⚠️ Falling back to element position for:', nodeKey);
          const domElement = editor.getElementByKey(nodeKey);
          if (domElement) {
            const elementRect = domElement.getBoundingClientRect();
            return {
              top: elementRect.top,
              left: elementRect.left
            };
          }
        }

        // For text nodes, use Lexical's createDOMRange directly
        if ($isTextNode(node)) {
          console.log('📝 Text node, creating range at offset:', offset);
          try {
            const range = createDOMRange(
              editor,
              node,
              offset,
              node,
              offset
            );

            if (range !== null) {
              // CRITICAL: Force fresh layout before measuring range
              const domElement = editor.getElementByKey(nodeKey);
              if (domElement) {
                void domElement.offsetHeight; // Force layout refresh
              }
              
              const rects = createRectsFromDOMRange(editor, range);
              if (rects.length > 0) {
                const rect = rects[0];
                console.log('📐 Text range position:', { 
                  top: rect.top, 
                  left: rect.left,
                  width: rect.width,
                  height: rect.height
                });
                
                return {
                  top: rect.top,
                  left: rect.left
                };
              }
            }
          } catch (error) {
            console.warn('🚨 Error creating range for text node:', error);
          }
        }

        // Get the DOM element for this node
        const domElement = editor.getElementByKey(nodeKey);
        if (!domElement) {
          console.warn('� DOM element not found for node key:', nodeKey);
          return { top: -1000, left: -1000 };
        }

        if (domElement) {
          try {
            // Create a range at the specified offset within the node
            const range = document.createRange();
            
            if (domElement!.nodeType === Node.TEXT_NODE) {
            // For text nodes, set range at the offset
            range.setStart(domElement!, Math.min(offset, domElement?.textContent?.length || 0));
            range.collapse(true);
          } else {
            // For element nodes, find the text content and position
            const walker = document.createTreeWalker(
              domElement!,
              NodeFilter.SHOW_TEXT,
              null
            );
            
            let currentOffset = 0;
            let textNode = walker.nextNode() as Text;
            
            while (textNode && currentOffset + textNode.textContent!.length < offset) {
              currentOffset += textNode.textContent!.length;
              textNode = walker.nextNode() as Text;
            }
            
            if (textNode) {
              range.setStart(textNode, Math.min(offset - currentOffset, textNode.textContent!.length));
              range.collapse(true);
            } else {
              // Fallback to end of element
              range.selectNodeContents(domElement!);
              range.collapse(false);
            }
          }

          const rect = range.getBoundingClientRect();
          if (rect.width > 0 || rect.height > 0) {
            return {
              top: rect.top,
              left: rect.left
            };
          }
        } catch (rangeError) {
          console.warn('Range error:', rangeError);
        }

        // Fallback to element position
        const elementRect = domElement!.getBoundingClientRect();
        return {
          top: elementRect.top,
          left: elementRect.left
        };
        } else {
          // No DOM element found
          return { top: -1000, left: -1000 };
        }
      });
    } catch (error) {
      console.warn('Error calculating cursor position:', error);
      const editorRect = editorElement.getBoundingClientRect();
      return { 
        top: editorRect.top + 20, 
        left: editorRect.left + 20 
      };
    }
  }, [getEditorElement, editor]);

  // Add scroll listener to update cursor positions when page scrolls
  useEffect(() => {
    const handleScroll = () => {
      console.log('🔄 Scroll detected, forcing cursor re-render');
      setForceUpdate(prev => prev + 1); // Use existing force update mechanism
    };

    // Listen to scroll events on window and any scrollable containers
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });
    
    // Also listen to editor container scroll if it exists
    const editorElement = getEditorElement();
    if (editorElement) {
      const editorContainer = editorElement.closest('.editor-container, .lexical-editor, [data-lexical-editor]');
      if (editorContainer) {
        editorContainer.addEventListener('scroll', handleScroll, { passive: true });
      }
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll);
      
      const editorElement = getEditorElement();
      if (editorElement) {
        const editorContainer = editorElement.closest('.editor-container, .lexical-editor, [data-lexical-editor]');
        if (editorContainer) {
          editorContainer.removeEventListener('scroll', handleScroll);
        }
      }
    };
  }, [setForceUpdate, getEditorElement]);

  console.log('🎬 LoroCollaborativePlugin component render called', {
    remoteCursorsCount: Object.keys(remoteCursors).length,
    remoteCursorsPeerIds: Object.keys(remoteCursors),
    clientId: clientId,
    peerIdRef: peerIdRef.current,
    editorElementExists: !!getEditorElement()
  });

  // Use React portal for cursor rendering
  return (
    <CursorsContainer 
      remoteCursors={remoteCursors}
      getPositionFromLexicalPosition={getPositionFromLexicalPosition}
      clientId={clientId}
      editor={editor}
    />
  );
}
