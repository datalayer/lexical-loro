import { UpdateListenerPayload, RootNode, ElementNode, TextNode, LineBreakNode, DecoratorNode } from 'lexical';
import { Binding } from '../Bindings';
import { propagateRootNode } from '../propagators/RootNodePropagator';
import { propagateLineBreakNode } from '../propagators/LineBreakNodePropagator';
import { propagateElementNode } from '../propagators/ElementNodePropagator';
import { propagateTextNode } from '../propagators/TextNodePropagator';
import { propagateDecoratorNode } from '../propagators/DecoratorNodePropagator';
import { isClassExtending } from '../utils/Utils';
import { scheduleAsyncCommit } from '../Bindings';
// import { syncCursorPositions, SyncCursorPositionsFn } from './SyncCursors';

export function syncLexicalToLoro(
  binding: Binding,
  update: UpdateListenerPayload
) {
  const { mutatedNodes } = update;

  if (mutatedNodes) {

    const tree = binding.tree;

    // Ensure we have a numeric peerId for TreeID format
    const peerId = Number(binding.doc.peerId);

    // Create options object for mutators
    const mutatorOptions = {
      binding,
      tree,
      peerId
    };

    // Process mutations in proper dependency order: containers before children
    // 1. First process RootNode, ElementNodes (containers) 
    // 2. Then process TextNodes, LineBreakNodes, DecoratorNodes (children)
    
    const containerClasses = [RootNode, ElementNode];
    const childClasses = [TextNode, LineBreakNode, DecoratorNode];

    // Process containers first to ensure parent mappings exist
    containerClasses.forEach(targetClass => {
      mutatedNodes.forEach((nodeMap, Klass) => {
        if (isClassExtending(Klass, targetClass)) {
          nodeMap.forEach((mutation, nodeKey) => {
            if (isClassExtending(Klass, RootNode)) {
              propagateRootNode(update, mutation, nodeKey, mutatorOptions);
            }
            else if (isClassExtending(Klass, ElementNode)) {
              propagateElementNode(update, mutation, nodeKey, mutatorOptions);
            }
          });
        }
      });
    });
    
    // Then process children to ensure their parents are already mapped
    childClasses.forEach(targetClass => {
      mutatedNodes.forEach((nodeMap, Klass) => {
        if (isClassExtending(Klass, targetClass)) {
          nodeMap.forEach((mutation, nodeKey) => {
            if (isClassExtending(Klass, TextNode)) {
              propagateTextNode(update, mutation, nodeKey, mutatorOptions);
            }
            else if (isClassExtending(Klass, LineBreakNode)) {
              propagateLineBreakNode(update, mutation, nodeKey, mutatorOptions);
            }
            else if (isClassExtending(Klass, DecoratorNode)) {
              propagateDecoratorNode(update, mutation, nodeKey, mutatorOptions);
            }
          });
        }
      });
    });

    // Option 1 - commit directly (synchronous, can be slow for large docs)
    // binding.doc.commit({ origin: binding.doc.peerIdStr });

    // Option 2 - Schedule an async commit instead of immediate synchronous commit
    // This reduces latency for large documents by debouncing commits
    // scheduleAsyncCommit(binding);

    // Option 3 - Schedule an async commit instead of immediate synchronous commit
    // This reduces latency for large documents by debouncing commits.
    
    const doCommit = () => requestIdleCallback(() => {
       binding.doc.commit({ origin: binding.doc.peerIdStr });
    }, { timeout: 2000 });
    doCommit();

    // Sync cursor positions after all node mutations are processed.
    // syncCursorPositions(binding, update);

  }
}
