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

    mutatedNodes.forEach((nodeMap, Klass) => {

      nodeMap.forEach((mutation, nodeKey) => {

        console.log('-------DLA', nodeKey)

        if (isClassExtending(Klass, RootNode)) {
          mutateRootNode(update, mutation, nodeKey, mutatorOptions);
        }
        else if (isClassExtending(Klass, LineBreakNode)) {
          mutateLineBreakNode(update, mutation, nodeKey, mutatorOptions);
        }
        else if (isClassExtending(Klass, ElementNode)) {
          mutateElementNode(update, mutation, nodeKey, mutatorOptions);
        }
        else if (isClassExtending(Klass, TextNode)) {
          mutateTextNode(update, mutation, nodeKey, mutatorOptions);
        }
        else if (isClassExtending(Klass, DecoratorNode)) {
          mutateDecoratorNode(update, mutation, nodeKey, mutatorOptions);
        } else {
          throw new Error(`Unsupported node type for key: ${nodeKey}, mutation: ${mutation}. Node class: ${Klass.name}`);
        }
      });
    });

  }

}
