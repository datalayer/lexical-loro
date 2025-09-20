import { LoroEventBatch } from 'loro-crdt';
import { $getRoot, $getSelection, $setSelection, SKIP_COLLAB_TAG } from 'lexical';
import { Binding } from '../Bindings';
import { Provider } from '../State';
import { syncCursorPositions, SyncCursorPositionsFn } from './SyncCursors';

// Import the new diff handlers
import { TreeDiffIntegrator } from '../integrators/TreeDiffIntegrator';
import { MapDiffIntegrator } from '../integrators/MapDiffIntegrator';
import { ListDiffIntegrator } from '../integrators/ListDiffIntegrator';
import { TextDiffIntegrator } from '../integrators/TextDiffIntegrator';
import { CounterDiffIntegrator } from '../integrators/CounterDiffIntegrator';

// Create singleton instances of the diff handlers (created once, reused across calls)
const treeIntegrator = new TreeDiffIntegrator();
const mapIntegrator = new MapDiffIntegrator();
const listIntegrator = new ListDiffIntegrator();
const textIntegrator = new TextDiffIntegrator();
const counterIntegrator = new CounterDiffIntegrator();

export function syncLoroToLexical(
  binding: Binding,
  provider: Provider,
  eventBatch: LoroEventBatch,
  isFromUndoManger: boolean,
  syncCursorPositionsFn: SyncCursorPositionsFn = syncCursorPositions,
): void {

  // Batch all events into a single discrete editor.update() to avoid race conditions
  // Using discrete: true ensures immediate synchronous commit before other operations
  binding.editor.update(() => {
    
    // Clear selection temporarily to avoid cursor position conflicts during text updates
    const currentSelection = $getSelection();
    if (currentSelection) {
      $setSelection(null);
    }
    
    // Process Loro events and apply them to Lexical using the appropriate handlers
    eventBatch.events.forEach((event, index) => {
      
      switch (event.diff.type) {
        case 'tree':
          // Call internal method that doesn't wrap in editor.update()
          treeIntegrator.handleInternal(event.diff as any, binding, provider);
          break;

        case 'map':
          // Call internal method that doesn't wrap in editor.update()
          if (event.target) {
            mapIntegrator.handleWithContextInternal(event.diff as any, event.target, binding, provider);
          } else {
            mapIntegrator.handleInternal(event.diff as any, binding, provider);
          }
          break;

        case 'list':
          listIntegrator.handleInternal(event.diff as any, binding, provider);
          break;

        case 'text':
          textIntegrator.handleInternal(event.diff as any, binding, provider);
          break;

        case 'counter':
          counterIntegrator.handleInternal(event.diff as any, binding, provider);
          break;

        default:
          throw new Error(`Unsupported event diff type: ${(event.diff as any).type}. Supported types are: 'tree', 'map', 'list', 'text', 'counter'.`);
      }
    });
    
  // discrete: true
  }, { tag: SKIP_COLLAB_TAG });

  // Verify final editor state after all events
  binding.editor.getEditorState().read(() => {
    const root = $getRoot();
    const allNodes = root.getChildren().flatMap(child => {
      const nodes = [child];
      if ('getChildren' in child && typeof child.getChildren === 'function') {
        nodes.push(...(child as any).getChildren());
      }
      return nodes;
    });
    
    const textNodes = allNodes.filter(node => node.getType() === 'text');
  });

  // Sync cursor positions after applying changes
  if (!isFromUndoManger) {
    syncCursorPositionsFn(binding, provider);
  }
}
