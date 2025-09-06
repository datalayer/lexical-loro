/**
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { EditorState, NodeKey, NodeMap, BaseSelection } from 'lexical';
import type { LoroBinding, LoroProvider } from '../LoroBinding';
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
  SKIP_SCROLL_INTO_VIEW_TAG
} from 'lexical';

// Collaboration tags (following YJS pattern)
export const LORO_COLLABORATION_TAG = 'loro-collaboration';
export const LORO_HISTORIC_TAG = 'loro-historic';
export const LORO_SKIP_COLLAB_TAG = 'loro-skip-collab';

/**
 * Sync Loro changes to Lexical editor (equivalent to YJS syncYjsChangesToLexical)
 * 
 * This is the main function that processes incoming Loro events and applies them
 * to the Lexical editor state, following the YJS collaboration pattern.
 * 
 * Key Architecture Mappings:
 * - YJS XmlText events → Loro Tree/Text events  
 * - YJS Delta operations → Loro Tree operations
 * - YJS RelativePosition → Loro Cursor
 * - YJS transaction origin → Loro update source
 */
export function syncLoroChangesToLexical(
  binding: LoroBinding, 
  provider: LoroProvider, 
  events: Array<LoroEvent>,
  isFromUndoManager: boolean,
  syncCursorPositionsFn?: (binding: LoroBinding, provider: LoroProvider) => void
): void {
  const { editor } = binding;
  const currentEditorState = editor._editorState;

  console.log('🔄 Syncing Loro changes to Lexical:', {
    eventCount: events.length,
    isFromUndoManager,
    hasEvents: events.length > 0
  });

  if (events.length === 0) {
    return;
  }

  // Pre-process events to extract deltas (following YJS pattern)
  // This ensures we have access to change information during the update
  const processedEvents = events.map(event => ({
    ...event,
    delta: extractLoroEventDelta(event)
  }));

  editor.update(
    () => {
      // Process each Loro event and apply to Lexical
      for (let i = 0; i < processedEvents.length; i++) {
        const event = processedEvents[i];
        $syncLoroEvent(binding, event);
      }

      // Handle selection recovery and cursor sync
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (doesLexicalSelectionNeedRecovering(selection)) {
          const prevSelection = currentEditorState._selection;
          if ($isRangeSelection(prevSelection)) {
            $syncLocalCursorPosition(binding, provider);
            if (doesLexicalSelectionNeedRecovering(selection)) {
              // If selected node was deleted, move selection to safe position
              const anchorNodeKey = selection.anchor.key;
              $moveSelectionToPreviousNode(anchorNodeKey, currentEditorState);
            }
          }
          syncLexicalSelectionToLoro(binding, provider, prevSelection, $getSelection());
        } else {
          $syncLocalCursorPosition(binding, provider);
        }
      }

      if (!isFromUndoManager) {
        // Preserve scroll position for external changes
        $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
      }
    },
    {
      onUpdate: () => {
        // Sync cursors after content update
        if (syncCursorPositionsFn) {
          syncCursorPositionsFn(binding, provider);
        }
        
        // Ensure root always has content (following YJS pattern)
        editor.update(() => {
          if ($getRoot().getChildrenSize() === 0) {
            $getRoot().append($createParagraphNode());
          }
        });
      },
      skipTransforms: true,
      tag: isFromUndoManager ? LORO_HISTORIC_TAG : LORO_COLLABORATION_TAG,
    },
  );
}

/**
 * Process individual Loro event (equivalent to YJS $syncEvent)
 * 
 * This function handles different types of Loro events:
 * - Tree structure changes (create, move, delete nodes)
 * - Text content changes (insert, delete text)
 * - Property updates (formatting, attributes)
 */
function $syncLoroEvent(binding: LoroBinding, event: any): void {
  console.log('🔄 Processing Loro event:', event);
  
  try {
    // const { rootTree, rootText } = binding; // Available for future implementation
    
    // Handle Tree events (structural changes)
    if (event.containerType === 'Tree') {
      $syncLoroTreeEvent(binding, event);
    }
    
    // Handle Text events (content changes)  
    if (event.containerType === 'Text') {
      $syncLoroTextEvent(binding, event);
    }
    
    // Ensure we have basic document structure
    ensureBasicDocumentStructure();
    
  } catch (error) {
    console.error('❌ Error processing Loro event:', error);
  }
}

/**
 * Sync Loro Tree events to Lexical structure (equivalent to YJS element operations)
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
function $handleTreeNodeCreate(_binding: LoroBinding, operation: any): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  console.log('➕ Creating tree node:', operation);
  // TODO: Create corresponding Lexical node
}

/**
 * Handle tree node movement  
 */
function $handleTreeNodeMove(_binding: LoroBinding, operation: any): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  console.log('🔄 Moving tree node:', operation);
  // TODO: Move corresponding Lexical node
}

/**
 * Handle tree node deletion
 */
function $handleTreeNodeDelete(_binding: LoroBinding, operation: any): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  console.log('🗑️ Deleting tree node:', operation);
  // TODO: Delete corresponding Lexical node
}

/**
 * Handle text insertion
 */
function $handleTextInsert(_binding: LoroBinding, offset: number, content: string | object): void { // eslint-disable-line @typescript-eslint/no-unused-vars
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
function $handleTextDelete(_binding: LoroBinding, offset: number, length: number): void { // eslint-disable-line @typescript-eslint/no-unused-vars
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
  provider: LoroProvider,
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
        syncLexicalSelectionToLoro(binding, provider, prevSelection, selection);
      });
    });
    
  } catch (error) {
    console.error('❌ Error syncing Lexical to Loro:', error);
  }
}

// Helper functions (simplified implementations)

function extractLoroEventDelta(_event: LoroEvent): any[] { // eslint-disable-line @typescript-eslint/no-unused-vars
  // TODO: Extract meaningful delta from Loro event
  return [];
}

function doesLexicalSelectionNeedRecovering(_selection: any): boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
  // TODO: Check if selection points to deleted nodes
  return false;
}

function $syncLocalCursorPosition(_binding: LoroBinding, _provider: LoroProvider): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  console.log('🎯 Syncing local cursor position');
  // TODO: Update local cursor in awareness
}

function $moveSelectionToPreviousNode(nodeKey: NodeKey, _editorState: EditorState): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  console.log('⬅️ Moving selection to previous node from:', nodeKey);
  // TODO: Find safe selection position
}

function syncLexicalSelectionToLoro(_binding: LoroBinding, _provider: LoroProvider, _prevSelection: BaseSelection | null, _currentSelection: BaseSelection | null): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  console.log('🎯 Syncing selection to Loro awareness');
  // TODO: Convert Lexical selection to Loro cursors
}

function ensureBasicDocumentStructure(): void {
  const root = $getRoot();
  if (root.getChildrenSize() === 0) {
    const paragraph = $createParagraphNode();
    const textNode = $createTextNode('');
    paragraph.append(textNode);
    root.append(paragraph);
    console.log('� Added initial paragraph to empty editor');
  }
}

function $findTextNodeAtOffset(_offset: number): any { // eslint-disable-line @typescript-eslint/no-unused-vars
  // TODO: Find text node at specific offset in document
  const root = $getRoot();
  const firstChild = root.getFirstChild();
  if (firstChild && $isElementNode(firstChild)) {
    return firstChild.getFirstChild();
  }
  return null;
}

function syncWithLoroTransaction(_binding: LoroBinding, fn: () => void): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  // TODO: Execute function within Loro transaction
  fn();
}

function $syncRootChangesToLoro(
  _binding: LoroBinding,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _lexicalRoot: any,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _prevNodeMap: NodeMap,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _dirtyElements: Map<NodeKey, boolean>,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _dirtyLeaves: Set<NodeKey> // eslint-disable-line @typescript-eslint/no-unused-vars
): void {
  console.log('🌱 Syncing root changes to Loro tree/text');
  // TODO: Convert Lexical root changes to Loro operations
}
