import { UpdateListenerPayload, RootNode, ElementNode, TextNode, LineBreakNode, DecoratorNode } from 'lexical';
import { Binding } from '../Bindings';
import { Provider } from '../State';
import { mutateRootNode } from '../mutators/RootNodeMutators';
import { mutateLineBreakNode } from '../mutators/LineBreakNodeMutators';
import { mutateElementNode } from '../mutators/ElementNodeMutators';
import { mutateTextNode } from '../mutators/TextNodeMutators';
import { mutateDecoratorNode } from '../mutators/DecoratorNodeMutators';
import { isClassExtending, toKeyNodeNumber } from '../utils/Utils';
// import { syncCursorPositions, SyncCursorPositionsFn } from './SyncCursors';

export function syncLexicalToLoro(
  binding: Binding,
  provider: Provider,
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
            console.log(`🔄 Processing container ${targetClass.name}: ${nodeKey} (${mutation})`);
            
            if (isClassExtending(Klass, RootNode)) {
              mutateRootNode(update, mutation, nodeKey, mutatorOptions);
            }
            else if (isClassExtending(Klass, ElementNode)) {
              mutateElementNode(update, mutation, nodeKey, mutatorOptions);
            }
            
            binding.doc.commit({ origin: binding.doc.peerIdStr })
          });
        }
      });
    });
    
    // Then process children to ensure their parents are already mapped
    childClasses.forEach(targetClass => {
      mutatedNodes.forEach((nodeMap, Klass) => {
        if (isClassExtending(Klass, targetClass)) {
          nodeMap.forEach((mutation, nodeKey) => {
            console.log(`🔄 Processing child ${targetClass.name}: ${nodeKey} (${mutation})`);
            
            if (isClassExtending(Klass, TextNode)) {
              mutateTextNode(update, mutation, nodeKey, mutatorOptions);
            }
            else if (isClassExtending(Klass, LineBreakNode)) {
              mutateLineBreakNode(update, mutation, nodeKey, mutatorOptions);
            }
            else if (isClassExtending(Klass, DecoratorNode)) {
              mutateDecoratorNode(update, mutation, nodeKey, mutatorOptions);
            } else {
              throw new Error(`Unsupported node type for key: ${nodeKey}, mutation: ${mutation}. Node class: ${Klass.name}`);
            }
            
            binding.doc.commit({ origin: binding.doc.peerIdStr })
          });
        }
      });
    });

  }

}
