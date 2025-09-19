import { LoroEventBatch } from 'loro-crdt';
import { $getRoot, $getSelection, $setSelection, SKIP_COLLAB_TAG } from 'lexical';
import { Binding } from '../Bindings';
import { Provider } from '../State';
import { syncCursorPositions, SyncCursorPositionsFn } from './SyncCursors';

// Import the new diff handlers
import { TreeDiffHandler } from '../handlers/TreeDiffHandler';
import { MapDiffHandler } from '../handlers/MapDiffHandler';
import { ListDiffHandler } from '../handlers/ListDiffHandler';
import { TextDiffHandler } from '../handlers/TextDiffHandler';
import { CounterDiffHandler } from '../handlers/CounterDiffHandler';

// Create singleton instances of the diff handlers (created once, reused across calls)
const treeHandler = new TreeDiffHandler();
const mapHandler = new MapDiffHandler();
const listHandler = new ListDiffHandler();
const textHandler = new TextDiffHandler();
const counterHandler = new CounterDiffHandler();

export function syncLoroToLexical(
  binding: Binding,
  provider: Provider,
  eventBatch: LoroEventBatch,
  isFromUndoManger: boolean,
  syncCursorPositionsFn: SyncCursorPositionsFn = syncCursorPositions,
): void {

  console.log('🔄 SyncLoroToLexical: Processing event batch with', eventBatch.events.length, 'events');

  // Batch all events into a single discrete editor.update() to avoid race conditions
  // Using discrete: true ensures immediate synchronous commit before other operations
  binding.editor.update(() => {
    console.log('🔄 Starting batched DISCRETE editor update for all events');
    
    // Clear selection temporarily to avoid cursor position conflicts during text updates
    const currentSelection = $getSelection();
    if (currentSelection) {
      console.log('🔄 Clearing selection during sync to prevent cursor conflicts');
      $setSelection(null);
    }
    
    // Process Loro events and apply them to Lexical using the appropriate handlers
    eventBatch.events.forEach((event, index) => {
      console.log(`🔄 Processing event ${index + 1}/${eventBatch.events.length} with diff type: ${event.diff.type}`);
      console.log(`🔄 Event details:`, event);
      
      // Special logging for text-related events
      if (event.target && event.target.includes('text')) {
        console.log(`📝 TEXT-RELATED EVENT: ${event.diff.type} for ${event.target}`);
      }

      switch (event.diff.type) {
        case 'tree':
          // Call internal method that doesn't wrap in editor.update()
          (treeHandler as any).handleInternal(event.diff as any, binding, provider);
          break;

        case 'map':
          // Call internal method that doesn't wrap in editor.update()
          if (event.target) {
            (mapHandler as any).handleWithContextInternal(event.diff as any, event.target, binding, provider);
          } else {
            (mapHandler as any).handleInternal(event.diff as any, binding, provider);
          }
          break;

        case 'list':
          (listHandler as any).handleInternal(event.diff as any, binding, provider);
          break;

        case 'text':
          (textHandler as any).handleInternal(event.diff as any, binding, provider);
          break;

        case 'counter':
          (counterHandler as any).handleInternal(event.diff as any, binding, provider);
          break;

        default:
          throw new Error(`Unsupported event diff type: ${(event.diff as any).type}. Supported types are: 'tree', 'map', 'list', 'text', 'counter'.`);
      }
    });
    
    console.log('🔄 Completed batched DISCRETE editor update for all events');
  }, { discrete: true, tag: SKIP_COLLAB_TAG });

  console.log('🔄 SyncLoroToLexical: Finished processing events');

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
    console.log(`📝 FINAL EDITOR STATE - Total nodes: ${allNodes.length}, Text nodes: ${textNodes.length}`);
    textNodes.forEach((textNode: any, i) => {
      console.log(`📝   Text Node ${i + 1}: Key=${textNode.getKey()}, Text="${textNode.getTextContent()}"`);
    });
  });

  // Sync cursor positions after applying changes
  if (!isFromUndoManger) {
    syncCursorPositionsFn(binding, provider);
  }
}
