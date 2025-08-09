/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {
  DecoratorNode,
  EditorState,
  ElementNode,
  NodeKey,
  TextNode,
} from 'lexical';

import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COLLABORATION_TAG,
} from 'lexical';

import {Binding, Provider} from '.';
import {CollabDecoratorNode} from './CollabDecoratorNode';
import {CollabElementNode} from './CollabElementNode';
import {CollabTextNode} from './CollabTextNode';
import {
  $moveSelectionToPreviousNode,
  doesSelectionNeedRecovering,
} from './Utils';

// Types for Loro events (simplified)
interface LoroEvent {
  type: string;
  path: string[];
  // Add other event properties as needed
}

// Type for cursor sync function
type SyncCursorPositionsFn = (
  binding: Binding,
  provider: Provider,
  cursorsContainer: HTMLElement,
) => void;

function $syncEvent(_binding: Binding, _event: LoroEvent): void {
  // Handle Loro events - simplified implementation
  // In a real implementation, you would need to handle specific Loro event types
  console.warn('$syncEvent not fully implemented for Loro');
}

export function $syncLexicalUpdateToLoro(
  binding: Binding,
  _provider: Provider,
  prevEditorState: EditorState,
  currEditorState: EditorState,
  dirtyElements: Map<NodeKey, IntentionallyMarkedAsDirtyElement>,
  dirtyLeaves: Set<NodeKey>,
  normalizedNodes: Set<NodeKey>,
  tags: Set<string>,
  _syncCursorPositions?: SyncCursorPositionsFn,
): void {
  if (tags.has(COLLABORATION_TAG)) {
    return;
  }

  console.log('Syncing Lexical update to Loro', { 
    dirtyElements: dirtyElements.size, 
    dirtyLeaves: dirtyLeaves.size, 
    normalizedNodes: normalizedNodes.size 
  });

  try {
    const loroDoc = binding.doc;
    const textContainer = loroDoc.getText('content');
    
    // Get the current full text content from Lexical
    const root = $getRoot();
    const currentText = root.getTextContent();
    
    // Get current Loro text content
    const currentLoroText = textContainer.toString();
    
    console.log('Text comparison', { 
      lexicalText: JSON.stringify(currentText), 
      loroText: JSON.stringify(currentLoroText),
      lexicalLength: currentText.length,
      loroLength: currentLoroText.length
    });
    
    // Only update if content is different
    if (currentText !== currentLoroText) {
      console.log('Text content differs, updating Loro');
      
      // Use simple approach: clear and replace
      // This is more reliable than complex diffing when structure changes
      if (currentLoroText.length > 0) {
        textContainer.delete(0, currentLoroText.length);
      }
      if (currentText.length > 0) {
        textContainer.insert(0, currentText);
      }
      
      console.log('Updated Loro text container, committing changes');
      loroDoc.commit();
    } else {
      console.log('Text content is the same, no update needed');
    }
    
  } catch (error) {
    console.error('Error syncing Lexical to Loro:', error);
  }
}

export function syncLoroChangesToLexical(
  binding: Binding,
  events: Array<LoroEvent>,
  _origin: unknown,
  _syncCursorPositions?: SyncCursorPositionsFn,
): void {
  const editor = binding.editor;
  
  // Simple implementation - in reality you'd need to handle Loro-specific events
  editor.update(
    () => {
      for (const event of events) {
        $syncEvent(binding, event);
      }

      const selection = $getSelection();

      if ($isRangeSelection(selection) && doesSelectionNeedRecovering(selection)) {
        const root = $getRoot();
        let firstChild = root.getFirstChild();

        if (firstChild === null) {
          firstChild = $createParagraphNode();
          root.append(firstChild);
        }

        $moveSelectionToPreviousNode(firstChild, false);
      }
    },
    {
      onUpdate: () => {
        // Optional cursor synchronization callback
      },
      skipTransforms: true,
      tag: COLLABORATION_TAG,
    },
  );
}

// Helper type from original implementation
type IntentionallyMarkedAsDirtyElement = boolean;

// Import helper function that would need to be implemented
function $createCollabNodeFromLexicalNode(
  _binding: Binding,
  _lexicalNode: unknown,
  _parent: CollabElementNode,
): CollabElementNode | CollabTextNode | CollabDecoratorNode | null {
  // This would be imported from Utils but simplified here
  console.warn('$createCollabNodeFromLexicalNode needs full implementation');
  return null;
}
