import { LoroDoc, LoroEventBatch, TreeID, LoroTree } from 'loro-crdt';
import { Binding } from '../Bindings';
import { Provider } from '../State';
import { syncCursorPositions, SyncCursorPositionsFn } from './SyncCursors';
import { UpdateListenerPayload, LexicalNode, RootNode, ElementNode, TextNode, LineBreakNode, DecoratorNode } from 'lexical';
import { mutateRootNode } from '../mutators/RootNodeMutators';
import { mutateLineBreakNode } from '../mutators/LineBreakNodeMutators';
import { mutateElementNode } from '../mutators/ElementNodeMutators';
import { mutateTextNode } from '../mutators/TextNodeMutators';
import { mutateDecoratorNode } from '../mutators/DecoratorNodeMutators';
import { isClassExtending } from '../utils/Utils';

export function syncLexicalToCRDT(
    binding: Binding,
    provider: Provider,
    update: UpdateListenerPayload
) {
    const { mutatedNodes, prevEditorState, editorState } = update;
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

			// Delegate to appropriate mutator based on node class type
            // Check if Klass extends RootNode
            if (isClassExtending(Klass, RootNode)) {
                mutateRootNode(update, mutation, nodeKey, mutatorOptions);
            } 
            // Check if Klass extends LineBreakNode
            else if (isClassExtending(Klass, LineBreakNode)) {
                mutateLineBreakNode(update, mutation, nodeKey, mutatorOptions);
            } 
            // Check if Klass extends ElementNode (includes subclasses like ParagraphNode, HeadingNode, etc.)
            else if (isClassExtending(Klass, ElementNode)) {
                mutateElementNode(update, mutation, nodeKey, mutatorOptions);
            } 
            // Check if Klass extends TextNode
            else if (isClassExtending(Klass, TextNode)) {
                mutateTextNode(update, mutation, nodeKey, mutatorOptions);
            } 
            // Check if Klass extends DecoratorNode (includes subclasses like ImageNode, VideoNode, etc.)
            else if (isClassExtending(Klass, DecoratorNode)) {
                mutateDecoratorNode(update, mutation, nodeKey, mutatorOptions);
            } else {
                console.warn(`Could not find node for key: ${nodeKey}, mutation: ${mutation}`);
            }
        });
    });
}
