import { LoroEventBatch } from 'loro-crdt';
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

  // Process Loro events and apply them to Lexical using the appropriate handlers
  eventBatch.events.forEach(event => {
    console.log(`🔄 Processing event with diff type: ${event.diff.type}`);
    console.log(`🔄 Event details:`, event);

    switch (event.diff.type) {
      case 'tree':
        treeHandler.handle(event.diff as any, binding, provider);
        break;

      case 'map':
        // Pass the event target (TreeID) to the map handler for context
        if (event.target) {
          (mapHandler as any).handleWithContext(event.diff as any, event.target, binding, provider);
        } else {
          mapHandler.handle(event.diff as any, binding, provider);
        }
        break;

      case 'list':
        listHandler.handle(event.diff as any, binding, provider);
        break;

      case 'text':
        textHandler.handle(event.diff as any, binding, provider);
        break;

      case 'counter':
        counterHandler.handle(event.diff as any, binding, provider);
        break;

      default:
        throw new Error(`Unsupported event diff type: ${(event.diff as any).type}. Supported types are: 'tree', 'map', 'list', 'text', 'counter'.`);
    }
  });

  console.log('🔄 SyncLoroToLexical: Finished processing events');

  // Sync cursor positions after applying changes
  if (!isFromUndoManger) {
    syncCursorPositionsFn(binding, provider);
  }
}
