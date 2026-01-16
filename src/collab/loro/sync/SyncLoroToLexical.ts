import { LoroEventBatch } from 'loro-crdt';
import { $addUpdateTag, $createParagraphNode, $getRoot, $getSelection, $isRangeSelection, $setSelection, COLLABORATION_TAG, HISTORIC_TAG, SKIP_COLLAB_TAG, SKIP_SCROLL_INTO_VIEW_TAG } from 'lexical';
import { Binding } from '../Bindings';
import { Provider } from '../State';
import { $syncLocalCursorPosition, syncCursorPositions, SyncCursorPositionsFn, syncLexicalSelectionToLoro } from './SyncCursors';

// Import the new diff integrators
import { TreeIntegrator } from '../integrators/TreeIntegrator';
import { MapIntegrator } from '../integrators/MapIntegrator';
import { ListIntegrator } from '../integrators/ListIntegrator';
import { CounterIntegrator } from '../integrators/CounterIntegrator';
import { $moveSelectionToPreviousNode, doesSelectionNeedRecovering } from '../utils/Utils';

// Create singleton instances of the diff integrators (created once, reused across calls)
const treeIntegrator = new TreeIntegrator();
const mapIntegrator = new MapIntegrator();
const listIntegrator = new ListIntegrator();
const counterIntegrator = new CounterIntegrator();

export function syncLoroToLexical(
  binding: Binding,
  provider: Provider,
  eventBatch: LoroEventBatch,
  isFromUndoManger: boolean,
  syncCursorPositionsFn: SyncCursorPositionsFn = syncCursorPositions,
): void {

  const editor = binding.editor;
  const currentEditorState = editor._editorState;

  // Batch all events into a single discrete editor.update() to avoid race conditions
  // Using discrete: true ensures immediate synchronous commit before other operations
  binding.editor.update(() => {
    
    // Clear selection temporarily to avoid cursor position conflicts during text updates
    const currentSelection = $getSelection();
    if (currentSelection) {
      $setSelection(null);
    }
    
    // Process Loro events and apply them to Lexical using the appropriate integrators
    eventBatch.events.forEach((event, index) => {
      
      switch (event.diff.type) {
        case 'tree':
          // Call internal method that doesn't wrap in editor.update()
          treeIntegrator.integrateInternal(event.diff as any, binding, provider);
          break;

        case 'map':
          // Call internal method that doesn't wrap in editor.update()
          if (event.target) {
            mapIntegrator.integrateWithContextInternal(event.diff as any, event.target, binding, provider);
          } else {
            mapIntegrator.integrateInternal(event.diff as any, binding, provider);
          }
          break;

        case 'list':
          listIntegrator.integrateInternal(event.diff as any, binding, provider);
          break;

        case 'counter':
          counterIntegrator.integrateInternal(event.diff as any, binding, provider);
          break;

        default:
          throw new Error(`Unsupported event diff type: ${(event.diff as any).type}. Supported types are: 'tree', 'map', 'list', 'text', 'counter'.`);
      }
    });
    
    const selection = $getSelection();

    if ($isRangeSelection(selection)) {
      if (doesSelectionNeedRecovering(selection)) {
        const prevSelection = currentEditorState._selection;

        if ($isRangeSelection(prevSelection)) {
          $syncLocalCursorPosition(binding, provider);
          if (doesSelectionNeedRecovering(selection)) {
            // If the selected node is deleted, move the selection to the previous or parent node.
            const anchorNodeKey = selection.anchor.key;
            $moveSelectionToPreviousNode(anchorNodeKey, currentEditorState);
          }
        }

        syncLexicalSelectionToLoro(
          binding,
          provider,
          prevSelection,
          $getSelection(),
        );
      } else {
        $syncLocalCursorPosition(binding, provider);
      }
    }

    if (!isFromUndoManger) {
      // If it is an external change, we don't want the current scroll position to get changed
      // since the user might've intentionally scrolled somewhere else in the document.
      $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
    }
  },
  {
    onUpdate: () => {
      syncCursorPositionsFn(binding, provider);
      // If there was a collision on the top level paragraph
      // we need to re-add a paragraph. To ensure this insertion properly syncs with other clients,
      // it must be placed outside of the update block above that has tags 'collaboration' or 'historic'.
      editor.update(() => {
        if ($getRoot().getChildrenSize() === 0) {
          $getRoot().append($createParagraphNode());
        }
      });
    },
//    discrete: true,
    skipTransforms: true,
//    tag: isFromUndoManger ? HISTORIC_TAG : COLLABORATION_TAG,
    tag: SKIP_COLLAB_TAG
  });
}
