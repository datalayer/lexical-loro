/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import React, { useEffect, useRef, useState, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import {
  type LexicalEditor,
  $getNodeByKey,
  type NodeKey,
} from 'lexical';
import { createDOMRange, createRectsFromDOMRange } from '@lexical/selection';
import { LoroDoc, LoroText, Cursor, EphemeralStore } from 'loro-crdt';
import type { EphemeralStoreEvent, PeerID } from 'loro-crdt';
import type { CursorProps, RemoteCursor } from './types';

// ============================================================================
// CURSOR COMPONENT
// ============================================================================

export const CursorComponent: React.FC<CursorProps> = ({ 
  peerId, 
  position, 
  color, 
  name, 
  isCurrentUser, 
  selection 
}) => {
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

// ============================================================================
// CURSORS CONTAINER
// ============================================================================

interface CursorsContainerProps {
  remoteCursors: Record<PeerID, RemoteCursor>;
  getPositionFromLexicalPosition: (key: NodeKey, offset: number) => { top: number; left: number } | null;
  clientId: string;
  editor: LexicalEditor;
}

interface CursorsContainerRef {
  update: (cursors: Record<PeerID, RemoteCursor>) => void;
}

export const CursorsContainer = React.forwardRef<CursorsContainerRef, CursorsContainerProps>(({ 
  remoteCursors, 
  getPositionFromLexicalPosition, 
  clientId,
  editor
}, ref) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  // Keep last known good positions to avoid snapping to x=0 when mapping fails
  const lastCursorStateRef = useRef<Record<string, { position: { top: number; left: number }, offset: number }>>({});
  
  // Ref to track cursor count without causing dependency issues
  const cursorCountRef = useRef(0);
  
  // Internal state to hold the current cursor data
  const [internalCursors, setInternalCursors] = useState<Record<PeerID, RemoteCursor>>(remoteCursors);
  
  // Update cursor count ref whenever internalCursors changes
  useEffect(() => {
    cursorCountRef.current = Object.keys(internalCursors).length;
  }, [internalCursors]);
  
  // Force re-render trigger for scroll updates
  const [scrollVersion, setScrollVersion] = useState(0);
  
  // Expose update method through ref
  useImperativeHandle(ref, () => ({
    update: (cursors: Record<PeerID, RemoteCursor>) => {
      console.log('👁️ CursorsContainer.update called:', {
        newCursorsCount: Object.keys(cursors).length,
        currentCursorsCount: Object.keys(internalCursors).length,
        newPeers: Object.keys(cursors),
        currentPeers: Object.keys(internalCursors),
        timestamp: Date.now()
      });
      setInternalCursors(cursors);
    }
  }), [internalCursors]); // Add internalCursors to deps to avoid stale closure
  
  // Use internal cursors instead of props for rendering
  const cursorsToRender = internalCursors;

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

  // Add scroll listener to update cursor positions when page scrolls
  useEffect(() => {
    const handleScroll = () => {
      console.log('🔄 Scroll detected, recalculating cursor positions');
      // Trigger cursor position recalculation by incrementing scroll version
      setScrollVersion(prev => prev + 1);
    };
    
    // Comprehensive test handler to debug scroll detection
    const testScrollHandler = (event: Event) => {
      const target = event.target as HTMLElement;
      console.log('🔍 TEST: Scroll event detected on:', {
        target: target,
        tagName: target?.tagName || 'unknown',
        className: target?.className || 'none',
        id: target?.id || 'none',
        scrollTop: target?.scrollTop || 0,
        scrollLeft: target?.scrollLeft || 0,
        windowScrollY: window.scrollY,
        windowScrollX: window.scrollX,
        timestamp: Date.now()
      });
    };

    console.log('📡 Setting up scroll listeners...');
    
    // Listen to scroll events on window and any scrollable containers
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', testScrollHandler, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });
    
    // Also listen on document.body and document.documentElement
    document.body.addEventListener('scroll', handleScroll, { passive: true });
    document.body.addEventListener('scroll', testScrollHandler, { passive: true });
    document.documentElement.addEventListener('scroll', handleScroll, { passive: true });
    document.documentElement.addEventListener('scroll', testScrollHandler, { passive: true });
    
    console.log('📡 Window, document, body, and documentElement scroll listeners attached');
    
    // Add listeners to common editor containers that might scroll
    const potentialContainers = [
      '.editor-container',
      '.lexical-editor',
      '.lexical-editor-container',
      '.lexical-content-editable',
      '[data-lexical-editor]',
      '[contenteditable="true"]'
    ];
    
    potentialContainers.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element, index) => {
        element.addEventListener('scroll', handleScroll, { passive: true });
        element.addEventListener('scroll', testScrollHandler, { passive: true });
        console.log(`📡 Added scroll listener to ${selector}[${index}]:`, {
          tagName: element.tagName,
          className: element.className
        });
      });
    });
    
    // Function to set up editor container scroll listener
    const setupEditorScrollListener = () => {
      console.log('📡 Attempting to find editor container...');
      
      // Try multiple ways to find the editor container
      let editorContainer: Element | null = null;
      
      // Method 1: Try via Lexical editor element
      const editorElement = editor.getElementByKey('root');
      console.log('📡 Method 1 - Lexical editor element:', !!editorElement);
      if (editorElement) {
        const editorContentEditable = editorElement.closest('[contenteditable]') as HTMLElement | null;
        console.log('📡 Method 1 - Found contenteditable:', !!editorContentEditable);
        if (editorContentEditable) {
          editorContainer = editorContentEditable.closest('.editor-container, .lexical-editor, .lexical-editor-container, [data-lexical-editor]');
          console.log('📡 Method 1 - Found container via closest:', !!editorContainer, editorContainer?.className);
        }
      }
      
      // Method 2: If not found, search DOM directly
      if (!editorContainer) {
        console.log('📡 Method 2 - Searching DOM directly...');
        editorContainer = document.querySelector('.lexical-editor-container');
        console.log('📡 Method 2 - Found container via querySelector:', !!editorContainer);
      }
      
      // Method 3: Find any container with overflow auto that contains contenteditable
      if (!editorContainer) {
        console.log('📡 Method 3 - Searching by overflow property...');
        const contentEditables = document.querySelectorAll('[contenteditable="true"]');
        console.log('📡 Method 3 - Found contenteditable elements:', contentEditables.length);
        for (const ce of contentEditables) {
          let parent = ce.parentElement;
          let level = 0;
          while (parent && level < 10) {
            const overflow = getComputedStyle(parent).overflow;
            console.log(`📡 Method 3 - Level ${level}:`, {
              tagName: parent.tagName,
              className: parent.className,
              overflow: overflow
            });
            if (overflow === 'auto' || overflow === 'scroll') {
              editorContainer = parent;
              console.log('📡 Method 3 - Found scrollable container:', parent.className);
              break;
            }
            parent = parent.parentElement;
            level++;
          }
          if (editorContainer) break;
        }
      }
      
      if (editorContainer) {
        editorContainer.addEventListener('scroll', handleScroll, { passive: true });
        editorContainer.addEventListener('scroll', testScrollHandler, { passive: true });
        console.log('📡 Editor container scroll listener attached:', {
          tagName: editorContainer.tagName,
          className: editorContainer.className,
          hasOverflow: getComputedStyle(editorContainer).overflow,
          method: editorElement ? 'lexical-element' : 'dom-search'
        });
        return editorContainer;
      } else {
        console.log('📡 No editor container found for scroll listening. Available containers:');
        // Debug: show what containers are available
        const contentEditable = document.querySelector('[contenteditable="true"]') as HTMLElement;
        if (contentEditable) {
          let currentElement = contentEditable.parentElement;
          let level = 0;
          while (currentElement && level < 5) {
            console.log(`📡   Level ${level}:`, {
              tagName: currentElement.tagName,
              className: currentElement.className,
              overflow: getComputedStyle(currentElement).overflow
            });
            currentElement = currentElement.parentElement;
            level++;
          }
        }
        return null;
      }
    };
    
    // Try to set up immediately
    const container = setupEditorScrollListener();
    
    // If not found, retry with more aggressive approach
    let retryContainer: Element | null = null;
    let retryInterval: NodeJS.Timeout | null = null;
    
    if (!container) {
      console.log('📡 Editor container not found immediately, setting up retry mechanism...');
      let retryCount = 0;
      const maxRetries = 20; // Try for 2 seconds
      
      retryInterval = setInterval(() => {
        retryCount++;
        console.log(`📡 Retry attempt ${retryCount}/${maxRetries}...`);
        retryContainer = setupEditorScrollListener();
        
        if (retryContainer || retryCount >= maxRetries) {
          if (retryInterval) {
            clearInterval(retryInterval);
            retryInterval = null;
          }
          if (!retryContainer && retryCount >= maxRetries) {
            console.log('📡 Failed to find editor container after maximum retries');
          }
        }
      }, 100);
    }
      
    return () => {
      // Cleanup interval if it exists
      if (retryInterval) {
        clearInterval(retryInterval);
      }
      
      // Remove window and document listeners
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', testScrollHandler);
      document.removeEventListener('scroll', handleScroll);
      
      // Remove editor container listeners
      if (container) {
        container.removeEventListener('scroll', handleScroll);
        container.removeEventListener('scroll', testScrollHandler);
      }
      if (retryContainer) {
        retryContainer.removeEventListener('scroll', handleScroll);
        retryContainer.removeEventListener('scroll', testScrollHandler);
      }
    };
  }, [editor]);

  // Recalculate cursor positions when scrollVersion changes due to scroll events
  useEffect(() => {
    // Use ref to check cursor count without adding to dependencies
    if (cursorCountRef.current === 0) return;
    
    console.log('📍 Recalculating cursor positions due to scroll, version:', scrollVersion);
    
    // Clear cached positions to force fresh calculations on scroll
    lastCursorStateRef.current = {};
    
    // Force update of internal cursors to trigger position recalculation
    // Use a timestamp to ensure React detects the change
    setInternalCursors(current => {
      const updated = { ...current };
      // Force a re-render by creating new cursor objects
      Object.keys(updated).forEach(peerId => {
        updated[peerId as PeerID] = {
          ...updated[peerId as PeerID]
        };
      });
      return updated;
    });
  }, [scrollVersion]); // Only depend on scrollVersion to prevent infinite loop

  if (!portalContainer) {
    return null;
  }

  console.log('🎯 Rendering cursors via React portal:', {
    remoteCursorsCount: Object.keys(cursorsToRender).length,
    clientId,
    scrollVersion // Include scroll version for debugging
  });

  const cursors = Object.values(cursorsToRender)
    .map(remoteCursor => {
      const { peerId, anchor, focus, user } = remoteCursor;
      if (!anchor) {
        console.log('⚠️ No anchor for peer:', peerId);
        return null;
      }

      try {
        // Get cursor position using standard positioning
        let position = getPositionFromLexicalPosition(anchor.key, anchor.offset);
        console.log('📍 Initial position calculation for peer:', peerId, {
          nodeKey: anchor.key,
          offset: anchor.offset,
          calculatedPosition: position,
          scrollVersion: scrollVersion
        });
        const lastState = lastCursorStateRef.current[peerId];
        
        // Basic position validation
        const isPositionValid = (pos: { top: number; left: number } | null) => {
          if (!pos) return false;
          
          // Check for NaN values
          if (isNaN(pos.top) || isNaN(pos.left)) return false;
          
          // Check for negative positions (usually indicates positioning error)
          if (pos.top < 0 || pos.left < 0) return false;
          
          // Check for unreasonably large positions (likely positioning error)
          if (pos.top > window.innerHeight * 3 || pos.left > window.innerWidth * 3) return false;
          
          return true;
        };
        
        // If position seems invalid, try to recalculate
        if (!isPositionValid(position)) {
          console.log('⚠️ Position validation failed, recalculating...', position);
          
          // Try again to get position
          position = getPositionFromLexicalPosition(anchor.key, anchor.offset);
          console.log('🔄 Recalculated position:', position);
        }

        // Heuristic: if mapping still invalid, or we detect a suspicious jump to line start,
        // keep the last known good position to avoid snapping to x=0.
        const looksLikeLineStartFallback = () => {
          if (!position || !lastState) return false;
          // Consider a suspicious leftward jump on the same line while offset increased or stayed
          const leftwardJump = position.left < (lastState.position.left - 20); // >20px jump left
          const roughlySameLine = Math.abs(position.top - lastState.position.top) < 30; // within same line height
          const offsetDidNotDecrease = anchor.offset >= (lastState.offset || 0);
          return leftwardJump && roughlySameLine && offsetDidNotDecrease;
        };

        if (!isPositionValid(position) || looksLikeLineStartFallback()) {
          if (!isPositionValid(position)) {
            console.log('⚠️ Final position invalid; using last known good position for peer:', peerId, { last: lastState?.position });
          } else {
            console.log('⚠️ Suspicious leftward jump detected; keeping last position for peer:', peerId, {
              current: position,
              last: lastState?.position,
              anchorOffset: anchor.offset,
              lastOffset: lastState?.offset
            });
          }
          if (lastState && isPositionValid(lastState.position)) {
            position = lastState.position;
          }
        }

        if (!isPositionValid(position)) {
          console.log('⚠️ No valid position available for peer after fallback:', peerId, position);
          return null;
        }

        // Position is now guaranteed to be valid due to isPositionValid check above
        const color = user?.color || '#007acc';
        const displayName = user?.name || peerId.slice(-8);
        const isCurrentUser = peerId === clientId;
        
        // CRITICAL: Skip rendering current user's own cursor
        if (isCurrentUser) {
          console.log('👁️ CURSOR FILTER: Skipping current user cursor in render:', {
            peerId,
            clientId,
            reason: 'Current user should not see their own collaborative cursor'
          });
          return null;
        }

        // Calculate selection rectangles if there's a focus position different from anchor
        let selection: { rects: Array<{ top: number; left: number; width: number; height: number }> } | undefined;
        
        if (focus && (focus.key !== anchor.key || focus.offset !== anchor.offset)) {
          // There's a selection, calculate the selection rectangles
          console.log('📝 Calculating selection for peer:', peerId, { anchor, focus });
          
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

        console.log('🟢 Rendering cursor for peer:', peerId, { 
          position, 
          color, 
          displayName, 
          isCurrentUser, 
          hasSelection: !!selection 
        });

        // Store last known good position and offset for future fallbacks
        lastCursorStateRef.current[peerId] = {
          position: { top: position!.top, left: position!.left },
          offset: anchor.offset
        };

        return (
          <CursorComponent
            key={peerId}
            peerId={peerId}
            position={{
              top: Math.max(position!.top, 20),
              left: Math.max(position!.left, 20)
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
});

CursorsContainer.displayName = 'CursorsContainer';

// ============================================================================
// CURSOR AWARENESS CLASS
// ============================================================================

export class CursorAwareness {
  private ephemeralStore: EphemeralStore;
  private peerId: string;
  private listeners: Array<(states: Map<string, any>, event?: EphemeralStoreEvent) => void> = [];
  private loroDoc: LoroDoc;  // Add reference to Loro document for proper cursor operations

  constructor(peer: PeerID, loroDoc: LoroDoc, timeout: number = 300_000) { // 5 minutes instead of 30 seconds
    this.ephemeralStore = new EphemeralStore(timeout);
    this.peerId = peer.toString();
    this.loroDoc = loroDoc;  // Store document reference for stable cursor operations
    
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

  // Simplified cursor creation from Lexical point (inspired by YJS createRelativePosition)
  // Loro Cursor = container ID + character ID, much simpler than YJS RelativePosition
  createLoroPosition(nodeKey: NodeKey, offset: number, textContainer: LoroText): Cursor | null {
    try {
      if (!this.loroDoc || !textContainer) {
        console.warn('❌ No Loro document or text container available');
        return null;
      }

      // SIMPLIFIED APPROACH: For Loro, we just need the global text position
      // Loro will handle the container ID + character ID mapping internally
      const globalPosition = this.calculateSimpleGlobalPosition(nodeKey, offset);
      
      // Let Loro create the cursor with its internal container+character structure
      const cursor = textContainer.getCursor(globalPosition);
      
      console.log('🎯 Created Loro cursor:', {
        nodeKey,
        offset,
        globalPosition,
        cursorCreated: !!cursor
      });
      
      return cursor || null;
    } catch (error) {
      console.warn('❌ Failed to create Loro position:', error);
      return null;
    }
  }

  // Simplified position calculation (much simpler than YJS approach)
  private calculateSimpleGlobalPosition(nodeKey: NodeKey, offset: number): number {
    // For Loro, we don't need complex CollabNode mapping like YJS
    // Just calculate the simple global text position
    // This is much simpler because Loro handles container+character mapping internally
    
    // TODO: Implement simple document traversal
    // For now, return a basic position - this would be implemented with:
    // 1. Find the text node in the document
    // 2. Calculate its start position 
    // 3. Add the offset within that node
    
    console.log('🔄 Calculating simple position for Loro cursor:', { nodeKey, offset });
    return 0; // Placeholder for simplified implementation
  }

  // Debug method to access raw ephemeral store data
  getRawStates() {
    return this.ephemeralStore.getAllStates();
  }
}
