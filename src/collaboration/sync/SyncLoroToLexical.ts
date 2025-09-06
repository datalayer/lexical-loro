/**
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { EditorState, NodeKey, NodeMap, BaseSelection } from 'lexical';
import type { LoroBinding } from '../LoroBinding';
import type { LoroProvider } from '../LoroProvider';
import type { LoroEvent } from 'loro-crdt';

import { 
  $getRoot, 
  $createParagraphNode, 
  $createTextNode,
  $addUpdateTag,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $isElementNode,
} from 'lexical';

// Import cursor sync functionality
import { syncLoroCursorPositions, type SyncLoroCursorPositionsFn } from './CursorSync';

// Collaboration tags (following YJS pattern)
export const LORO_COLLABORATION_TAG = 'loro-collaboration';
export const LORO_HISTORIC_TAG = 'loro-historic';
export const LORO_SKIP_COLLAB_TAG = 'loro-skip-collab';

// Utility functions (placeholders for now - will be properly implemented)
function doesLexicalSelectionNeedRecovering(_selection: any): boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
  // TODO: Implement proper selection recovery logic following YJS pattern
  return false;
}

function syncLocalCursorPosition(_binding: LoroBinding): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  // TODO: Implement local cursor position sync
  console.log('🎯 Syncing local cursor position');
}

function $moveSelectionToPreviousNode(anchorNodeKey: NodeKey, _editorState: EditorState): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  // TODO: Implement selection movement logic following YJS pattern
  console.log('🎯 Moving selection to previous node:', anchorNodeKey);
}

function syncLexicalSelectionToLoro(
  _binding: LoroBinding, // eslint-disable-line @typescript-eslint/no-unused-vars
  prevSelection: BaseSelection | null, 
  currentSelection: BaseSelection | null
): void {
  // TODO: Implement selection sync to Loro
  console.log('🎯 Syncing Lexical selection to Loro:', { prevSelection, currentSelection });
}

function getOrInitCollabNodeFromLoroTarget(_binding: LoroBinding, target: any): any { // eslint-disable-line @typescript-eslint/no-unused-vars
  // TODO: Implement proper collaboration node retrieval/creation following YJS pattern
  console.log('🔗 Getting collab node from Loro target:', target);
  return null;
}

function handleTreeNodeCreation(_binding: LoroBinding, _collabNode: any, action: any): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  // TODO: Implement tree node creation handling
  console.log('🌳 Handling tree node creation:', action);
}

function handleTreeNodeDeletion(_binding: LoroBinding, _collabNode: any, action: any): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  // TODO: Implement tree node deletion handling
  console.log('🌳 Handling tree node deletion:', action);
}

function handleTreeNodeMove(_binding: LoroBinding, _collabNode: any, action: any): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  // TODO: Implement tree node move handling
  console.log('🌳 Handling tree node move:', action);
}

function applyLoroTextDelta(_binding: LoroBinding, _collabNode: any, delta: any): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  // TODO: Implement text delta application following YJS pattern
  console.log('📝 Applying Loro text delta:', delta);
}

function applyLoroMapDelta(_binding: LoroBinding, _collabNode: any, delta: any): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  // TODO: Implement map delta application following YJS pattern
  console.log('🗺️ Applying Loro map delta:', delta);
}

/**
 * Main sync function (equivalent to YJS syncYjsChangesToLexical)
 * 
 * This function processes Loro events and applies them to the Lexical editor.
 * It follows the same pattern as YJS's syncYjsChangesToLexical function.
 */
export function syncLoroChangesToLexical(
  binding: LoroBinding,
  events: any[], // TODO: Type properly with Loro event types
  isFromUndoManager: boolean = false,
  syncCursorPositionsFn: SyncLoroCursorPositionsFn = syncLoroCursorPositions,
): void {
  const editor = binding.editor;
  const currentEditorState = editor._editorState;

  console.log('🔄 Syncing Loro changes to Lexical:', {
    eventCount: events.length,
    isFromUndoManager,
    currentStateVersion: currentEditorState._readOnly ? 'readonly' : 'writable'
  });

  // Precompute deltas before editor update (following YJS pattern)
  events.forEach((event) => {
    if (event.delta) {
      // Access delta to ensure it's computed during event call
      void event.delta;
    }
  });

  editor.update(
    () => {
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        processLoroEvent(binding, event);
      }

      // Handle selection recovery (following YJS pattern)
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (doesLexicalSelectionNeedRecovering(selection)) {
          const prevSelection = currentEditorState._selection;
          
          if ($isRangeSelection(prevSelection)) {
            syncLocalCursorPosition(binding);
            if (doesLexicalSelectionNeedRecovering(selection)) {
              // If the selected node is deleted, move selection to previous or parent node
              const anchorNodeKey = selection.anchor.key;
              $moveSelectionToPreviousNode(anchorNodeKey, currentEditorState);
            }
          }

          syncLexicalSelectionToLoro(binding, prevSelection, $getSelection());
        } else {
          syncLocalCursorPosition(binding);
        }
      }

      if (!isFromUndoManager) {
        // External changes shouldn't affect scroll position
        $addUpdateTag('skip-scroll-into-view');
      }
    },
    {
      onUpdate: () => {
        syncCursorPositionsFn(binding);
        
        // Ensure root has at least one paragraph (following YJS pattern)
        editor.update(() => {
          if ($getRoot().getChildrenSize() === 0) {
            $getRoot().append($createParagraphNode());
          }
        });
      },
      skipTransforms: true,
      tag: isFromUndoManager ? 'historic' : 'collaboration',
    },
  );
}

/**
 * Process individual Loro events (equivalent to YJS $syncEvent)
 * 
 * Handles different types of Loro events and applies them to the corresponding
 * collaboration nodes.
 */
function processLoroEvent(binding: LoroBinding, event: any): void {
  try {
    const { target } = event;
    
    // Handle different container types
    if (target && target.kind) {
      switch (target.kind) {
        case 'Tree': {
          processLoroTreeEvent(binding, event);
          break;
        }
        case 'Text': {
          processLoroTextEvent(binding, event);
          break;
        }
        case 'Map': {
          processLoroMapEvent(binding, event);
          break;
        }
        default: {
          console.warn('🔄 Unknown Loro container type:', target.kind);
          break;
        }
      }
    } else {
      console.warn('🔄 Loro event missing target or kind:', event);
    }
  } catch (error) {
    console.error('❌ Failed to process Loro event:', error, event);
  }
}

/**
 * Process Loro Tree events (equivalent to YJS XmlText/XmlElement events)
 * 
 * Handles structural changes in the document hierarchy.
 */
function processLoroTreeEvent(binding: LoroBinding, event: any): void {
  const { target, diff } = event;
  
  console.log('🌳 Processing Loro Tree event:', { target, diff });
  
  // Get or create collaboration node for this tree
  const collabNode = getOrInitCollabNodeFromLoroTarget(binding, target);
  
  if (collabNode && diff) {
    // Process tree diff operations
    if (diff.type === 'tree') {
      // Handle tree structure changes
      for (const action of diff.diff) {
        switch (action.type) {
          case 'create': {
            // Node creation
            handleTreeNodeCreation(binding, collabNode, action);
            break;
          }
          case 'delete': {
            // Node deletion  
            handleTreeNodeDeletion(binding, collabNode, action);
            break;
          }
          case 'move': {
            // Node movement
            handleTreeNodeMove(binding, collabNode, action);
            break;
          }
          default: {
            console.warn('🌳 Unknown tree action type:', action.type);
            break;
          }
        }
      }
    }
  }
}

/**
 * Process Loro Text events (equivalent to YJS Text events)
 * 
 * Handles text content changes.
 */
function processLoroTextEvent(binding: LoroBinding, event: any): void {
  const { target, diff } = event;
  
  console.log('📝 Processing Loro Text event:', { target, diff });
  
  // Get or create collaboration node for this text
  const collabNode = getOrInitCollabNodeFromLoroTarget(binding, target);
  
  if (collabNode && diff) {
    // Process text diff operations
    if (diff.type === 'text') {
      // Apply text delta changes
      applyLoroTextDelta(binding, collabNode, diff.diff);
    }
  }
}

/**
 * Process Loro Map events (equivalent to YJS Map events for node properties)
 * 
 * Handles property changes on nodes.
 */
function processLoroMapEvent(binding: LoroBinding, event: any): void {
  const { target, diff } = event;
  
  console.log('🗺️ Processing Loro Map event:', { target, diff });
  
  // Get or create collaboration node for this map
  const collabNode = getOrInitCollabNodeFromLoroTarget(binding, target);
  
  if (collabNode && diff) {
    // Process map property changes
    if (diff.type === 'map') {
      applyLoroMapDelta(binding, collabNode, diff.diff);
    }
  }
}

/**
 * Sync Lexical Tree events to Loro structure (equivalent to YJS element operations)
 */
function $syncLoroTreeEvent(binding: LoroBinding, event: any): void {
  console.log('🌳 Processing Tree event:', event);
  
  const { delta } = event;
  if (!delta || !Array.isArray(delta)) {
    return;
  }

  // Process tree operations
  for (const operation of delta) {
    if (operation.action === 'create') {
      $handleTreeNodeCreate(binding, operation);
    } else if (operation.action === 'move') {
      $handleTreeNodeMove(binding, operation);
    } else if (operation.action === 'delete') {
      $handleTreeNodeDelete(binding, operation);
    }
  }
}

/**
 * Sync Loro Text events to Lexical content (equivalent to YJS text operations)
 */
function $syncLoroTextEvent(binding: LoroBinding, event: any): void {
  console.log('📝 Processing Text event:', event);
  
  const { delta } = event;
  if (!delta || !Array.isArray(delta)) {
    return;
  }

  // Apply text deltas to Lexical content
  let offset = 0;
  for (const operation of delta) {
    if (operation.retain) {
      offset += operation.retain;
    } else if (operation.delete) {
      $handleTextDelete(binding, offset, operation.delete);
    } else if (operation.insert) {
      $handleTextInsert(binding, offset, operation.insert);
      offset += typeof operation.insert === 'string' ? operation.insert.length : 1;
    }
  }
}

/**
 * Handle tree node creation
 */
function $handleTreeNodeCreate(_binding: LoroBinding, operation: any): void {
  console.log('➕ Creating tree node:', operation);
  // TODO: Create corresponding Lexical node
}

/**
 * Handle tree node movement  
 */
function $handleTreeNodeMove(_binding: LoroBinding, operation: any): void {
  console.log('🔄 Moving tree node:', operation);
  // TODO: Move corresponding Lexical node
}

/**
 * Handle tree node deletion
 */
function $handleTreeNodeDelete(_binding: LoroBinding, operation: any): void {
  console.log('🗑️ Deleting tree node:', operation);
  // TODO: Delete corresponding Lexical node
}

/**
 * Handle text insertion
 */
function $handleTextInsert(_binding: LoroBinding, offset: number, content: string | object): void {
  console.log('📝 Inserting text at offset', offset, ':', content);
  
  if (typeof content === 'string') {
    // Find the text node at the given offset and insert content
    const textNode = $findTextNodeAtOffset(offset);
    if (textNode && $isTextNode(textNode)) {
      const currentText = textNode.getTextContent();
      const beforeText = currentText.substring(0, offset);
      const afterText = currentText.substring(offset);
      textNode.setTextContent(beforeText + content + afterText);
    }
  }
}

/**
 * Handle text deletion
 */
function $handleTextDelete(_binding: LoroBinding, offset: number, length: number): void {
  console.log('🗑️ Deleting text at offset', offset, 'length:', length);
  
  const textNode = $findTextNodeAtOffset(offset);
  if (textNode && $isTextNode(textNode)) {
    const currentText = textNode.getTextContent();
    const beforeText = currentText.substring(0, offset);
    const afterText = currentText.substring(offset + length);
    textNode.setTextContent(beforeText + afterText);
  }
}

/**
 * Sync Lexical editor changes to Loro (equivalent to YJS syncLexicalUpdateToYjs)
 */
export function syncLexicalUpdateToLoro(
  binding: LoroBinding,
  _provider: LoroProvider, // eslint-disable-line @typescript-eslint/no-unused-vars
  prevEditorState: EditorState,
  currEditorState: EditorState,
  dirtyElements: Map<NodeKey, boolean>,
  dirtyLeaves: Set<NodeKey>,
  normalizedNodes: Set<NodeKey>,
  tags: Set<string>
): void {
  console.log('📝 Syncing Lexical changes to Loro:', {
    dirtyElements: dirtyElements.size,
    dirtyLeaves: dirtyLeaves.size,
    normalizedNodes: normalizedNodes.size,
    tags: Array.from(tags)
  });

  // Skip if this update came from collaboration to prevent loops
  if (tags.has(LORO_COLLABORATION_TAG) || tags.has(LORO_HISTORIC_TAG)) {
    console.log('⏭️ Skipping collaboration update to prevent loop');
    return;
  }

  try {
    // Perform sync within a Loro transaction (equivalent to YJS syncWithTransaction)
    syncWithLoroTransaction(binding, () => {
      currEditorState.read(() => {
        // Handle root changes
        if (dirtyElements.has('root')) {
          const prevNodeMap = prevEditorState._nodeMap;
          const nextLexicalRoot = $getRoot();
          
          console.log('🌱 Syncing root changes');
          $syncRootChangesToLoro(binding, nextLexicalRoot, prevNodeMap, dirtyElements, dirtyLeaves);
        }

        // Sync selection changes
        const selection = $getSelection();
        const prevSelection = prevEditorState._selection;
        syncLexicalSelectionToLoro(binding, prevSelection, selection);
      });
    });
    
  } catch (error) {
    console.error('❌ Error syncing Lexical to Loro:', error);
  }
}

// Helper functions (simplified implementations)

function ensureBasicDocumentStructure(): void {
  const root = $getRoot();
  if (root.getChildrenSize() === 0) {
    const paragraph = $createParagraphNode();
    const textNode = $createTextNode('');
    paragraph.append(textNode);
    root.append(paragraph);
    console.log('📄 Added initial paragraph to empty editor');
  }
}

function $findTextNodeAtOffset(_offset: number): any {
  // TODO: Find text node at specific offset in document
  const root = $getRoot();
  const firstChild = root.getFirstChild();
  if (firstChild && $isElementNode(firstChild)) {
    return firstChild.getFirstChild();
  }
  return null;
}

function syncWithLoroTransaction(_binding: LoroBinding, fn: () => void): void {
  // TODO: Execute function within Loro transaction
  fn();
}

function $syncRootChangesToLoro(
  _binding: LoroBinding,
  _lexicalRoot: any,
  _prevNodeMap: NodeMap,
  _dirtyElements: Map<NodeKey, boolean>,
  _dirtyLeaves: Set<NodeKey>
): void {
  console.log('🌱 Syncing root changes to Loro tree/text');
  // TODO: Convert Lexical root changes to Loro operations
}
