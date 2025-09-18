import { LoroEventBatch } from 'loro-crdt';
import { Binding } from '../Bindings';
import { Provider } from '../State';
import { syncCursorPositions, SyncCursorPositionsFn } from './SyncCursors';
import { parseTreeID } from '../utils/Utils';
import { createLexicalNodeFromLoro } from '../utils/NodeFactory';
import { $getRoot, $isElementNode } from 'lexical';

export function syncLoroToLexical(
  binding: Binding,
  provider: Provider,
  eventBatch: LoroEventBatch,
  isFromUndoManger: boolean,
  syncCursorPositionsFn: SyncCursorPositionsFn = syncCursorPositions,
): void {

  const tree = binding.tree;

  // Process Loro events and apply them to Lexical
  eventBatch.events.forEach(event => {

    switch (event.diff.type) {
      case 'tree': {
        // Handle tree structure changes (node creation, movement, deletion)
        console.log('---DLA Handling TreeDiff:', event.diff);
        event.diff.diff.forEach(treeChange => {
          switch (treeChange.action) {
            case 'create': {
              // Parse TreeID to get nodeKey and peerId
              const { nodeKey, peerId } = parseTreeID(treeChange.target);

              // Get the tree node to determine its type
              if (tree.has(treeChange.target)) {
                const treeNode = tree.getNodeByID(treeChange.target);
                const nodeType = treeNode?.data.get('nodeType');

                console.log(`---DLA Creating Lexical node from Loro: type=${nodeType}, key=${nodeKey}`);

                // Use NodeFactory to create the appropriate Lexical node
                binding.editor.update(() => {
                  // Get parent node from Loro tree structure if available
                  const parentTreeId = treeChange.parent;
                  let parentLexicalNode = parentTreeId ? 
                    binding.nodeMapper.getLexicalNodeByLoroId(parentTreeId, binding.editor.getEditorState()) : 
                    $getRoot();

                  // Create the Lexical node using the NodeFactory
                  const lexicalNode = createLexicalNodeFromLoro(
                    treeChange.target,
                    tree,
                    parentLexicalNode,
                    treeChange.index,
                    { tree, binding, provider }
                  );

                  if (lexicalNode && parentLexicalNode && $isElementNode(parentLexicalNode)) {
                    // Insert the node at the specified index
                    if (treeChange.index !== undefined) {
                      parentLexicalNode.splice(treeChange.index, 0, [lexicalNode]);
                    } else {
                      parentLexicalNode.append(lexicalNode);
                    }
                  }
                });
              }
              break;
            }
            case 'move': {
              // Handle node movement in Lexical
              const { nodeKey, peerId } = parseTreeID(treeChange.target);
              console.log(`---DLA Moving Lexical node from Loro: key=${nodeKey}`);

              // TODO: Implement moveNodeFromLoro
              // Example: updateTextNodeFromLoro(treeChange.target, lexicalNode, newParent, newIndex, options)
              break;
            }
            case 'delete': {
              // Handle node deletion in Lexical
              const { nodeKey, peerId } = parseTreeID(treeChange.target);
              console.log(`---DLA Deleting Lexical node from Loro: key=${nodeKey}`);

              // TODO: Implement deleteNodeFromLoro
              // Example: deleteTextNodeFromLoro(treeChange.target, lexicalNode, options)
              break;
            }
            default:
              throw new Error(`Unknown tree change action: ${(treeChange as any).action}`);
          }
        });
        break;
      }

      case 'map': {
        // Handle map data changes (node properties, metadata updates)
        console.log('---DLA Handling MapDiff:', event.diff);

        const mapDiff = event.diff as any;

        // Handle updated properties
        if (mapDiff.updated) {
          Object.entries(mapDiff.updated).forEach(([key, value]) => {
            console.log(`---DLA Map update: ${key} = ${value}`);
            // TODO: Update corresponding Lexical node property
            // Example: updateLexicalNodeProperty(nodeKey, key, value)
          });
        }

        // Handle deleted properties
        if (mapDiff.deleted) {
          mapDiff.deleted.forEach((key: string) => {
            console.log(`---DLA Map delete: ${key}`);
            // TODO: Remove property from corresponding Lexical node
            // Example: removeLexicalNodeProperty(nodeKey, key)
          });
        }
        break;
      }

      case 'list': {
        // Handle list changes (insertions, deletions, moves in ordered structures)
        console.log('---DLA Handling ListDiff:', event.diff);

        const listDiff = event.diff as any;

        if (listDiff.diff) {
          listDiff.diff.forEach((change: any) => {
            switch (change.type) {
              case 'insert':
                console.log(`---DLA List insert at ${change.index}: ${change.value}`);
                // TODO: Insert item in corresponding Lexical structure
                // Example: insertIntoLexicalList(change.index, change.value)
                break;
              case 'delete':
                console.log(`---DLA List delete at ${change.index}, length: ${change.length}`);
                // TODO: Delete from corresponding Lexical structure
                // Example: deleteFromLexicalList(change.index, change.length)
                break;
              case 'retain':
                // No action needed for retain operations
                break;
              default:
                console.warn(`---DLA Unknown list change type: ${change.type}`);
            }
          });
        }
        break;
      }

      case 'text': {
        // Handle text changes (character insertions, deletions, formatting)
        console.log('---DLA Handling TextDiff:', event.diff);

        const textDiff = event.diff as any;

        if (textDiff.diff) {
          textDiff.diff.forEach((change: any) => {
            switch (change.type) {
              case 'insert':
                console.log(`---DLA Text insert at ${change.index}: "${change.value}"`);
                // TODO: Insert text in corresponding Lexical TextNode
                // Example: insertTextInLexicalNode(nodeKey, change.index, change.value)
                break;
              case 'delete':
                console.log(`---DLA Text delete at ${change.index}, length: ${change.length}`);
                // TODO: Delete text from corresponding Lexical TextNode
                // Example: deleteTextFromLexicalNode(nodeKey, change.index, change.length)
                break;
              case 'retain':
                // Handle text formatting changes
                if (change.attributes) {
                  console.log(`---DLA Text format at ${change.index}, length: ${change.length}, attributes:`, change.attributes);
                  // TODO: Apply formatting to corresponding Lexical TextNode
                  // Example: applyTextFormatting(nodeKey, change.index, change.length, change.attributes)
                }
                break;
              default:
                console.warn(`---DLA Unknown text change type: ${change.type}`);
            }
          });
        }
        break;
      }

      case 'counter': {
        // Handle counter changes (increment/decrement operations)
        console.log('---DLA Handling CounterDiff:', event.diff);

        const counterDiff = event.diff as any;

        if (counterDiff.increment !== undefined) {
          console.log(`---DLA Counter increment: ${counterDiff.increment}`);
          // TODO: Update corresponding Lexical counter or numeric property
          // Example: updateLexicalCounter(nodeKey, counterDiff.increment)
        }

        if (counterDiff.value !== undefined) {
          console.log(`---DLA Counter set value: ${counterDiff.value}`);
          // TODO: Set counter value in corresponding Lexical structure
          // Example: setLexicalCounterValue(nodeKey, counterDiff.value)
        }
        break;
      }

      default:
        throw new Error(`Unsupported event diff type: ${(event.diff as any).type}. Supported types are: 'tree', 'map', 'list', 'text', 'counter'.`);
    }
  });

  // Sync cursor positions after applying changes
  if (!isFromUndoManger) {
    syncCursorPositionsFn(binding, provider);
  }
}
