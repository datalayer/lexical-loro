import { LoroEventBatch } from 'loro-crdt';
import { Binding } from '../Bindings';
import { Provider } from '../State';
import { syncCursorPositions, SyncCursorPositionsFn } from './SyncCursors';
import { parseTreeID } from '../utils/Utils';

export function syncCRDTToLexical(
  binding: Binding,
  provider: Provider,
  eventBatch: LoroEventBatch,
  isFromUndoManger: boolean,
  syncCursorPositionsFn: SyncCursorPositionsFn = syncCursorPositions,
): void {

    console.log('DLA syncCRDTToLexical called with eventBatch:', eventBatch);
    const tree = binding.tree;
    
    // Process Loro tree events and apply them to Lexical
    eventBatch.events.forEach(event => {
        if (event.diff.type === 'tree') {
            event.diff.diff.forEach(treeChange => {
                switch (treeChange.action) {
                    case 'create': {
                        // Parse TreeID to get nodeKey and peerId
                        const { nodeKey, peerId } = parseTreeID(treeChange.target);
                        
                        // Get the tree node to determine its type
                        if (tree.has(treeChange.target)) {
                            const treeNode = tree.getNodeByID(treeChange.target);
                            const nodeType = treeNode?.data.get('nodeType');
                            
                            // Use appropriate mutator based on node type
                            // Note: For CRDT->Lexical sync, you'd call the *FromLoro functions
                            // This is a placeholder showing the structure
                            console.log(`DLA Creating Lexical node from CRDT: type=${nodeType}, key=${nodeKey}`);
                            
                            // Example: createTextNodeFromLoro(treeChange.target, parentNode, index, options)
                        }
                        break;
                    }
                    case 'move': {
                        // Handle node movement in Lexical
                        const { nodeKey, peerId } = parseTreeID(treeChange.target);
                        console.log(`DLA Moving Lexical node from CRDT: key=${nodeKey}`);
                        
                        // Example: updateTextNodeFromLoro(treeChange.target, lexicalNode, newParent, newIndex, options)
                        break;
                    }
                    case 'delete': {
                        // Handle node deletion in Lexical
                        const { nodeKey, peerId } = parseTreeID(treeChange.target);
                        console.log(`DLA Deleting Lexical node from CRDT: key=${nodeKey}`);
                        
                        // Example: deleteTextNodeFromLoro(treeChange.target, lexicalNode, options)
                        break;
                    }
                }
            });
        }
    });
    
    // Sync cursor positions after applying changes
    if (!isFromUndoManger) {
        syncCursorPositionsFn(binding, provider);
    }
}
