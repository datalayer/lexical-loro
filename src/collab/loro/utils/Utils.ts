import { LoroDoc, TreeID } from 'loro-crdt';
import { $getSelection, $isRangeSelection, LexicalNode, NodeKey, TextNode } from 'lexical';
import simpleDiffWithCursor from '../../utils/simpleDiffWithCursor';

const DEFAULT_TREE_NAME = 'tree';

/**
 * Ensure doc has a LoroTree instance
 */
export function createLoroTree(doc: LoroDoc, treeName = DEFAULT_TREE_NAME) {
  const tree = doc.getTree(treeName);
  // Enable fractional index for ordered siblings (useful for maintaining order)
  tree.enableFractionalIndex(0.001);
	return tree;
}

/**
 * Helper function to parse TreeID back to nodeKey and peerId
 */
export function parseTreeID(treeId: TreeID): { nodeKey: NodeKey; peerId: number } {
	const [nodeKey, peerId] = treeId.split('@');
	return {
		nodeKey: nodeKey,
		peerId: Number(peerId)
	};
}

/**
 * Helper function to get Lexical node information for Loro sync
 */
export function getLexicalNodeInfo(node: LexicalNode): { parentKey?: string; index?: number } {
	// TODO: Implement logic to get parent and index from Lexical node
	// This is a placeholder that should be replaced with actual Lexical API calls
	return {
		parentKey: node.getParent()?.getKey(),
		index: node.getIndexWithinParent()
	};
}

/**
 * Check if a class extends another class (proper inheritance checking)
 */
export function isClassExtending(Klass: any, BaseClass: any): boolean {
	// Direct class equality
	if (Klass === BaseClass) {
		return true;
	}
	
	// Check by name (for cases where classes might be different instances)
	if (Klass.name === BaseClass.name) {
		return true;
	}
	
	// Check prototype chain for inheritance
	if (Klass.prototype && BaseClass.isPrototypeOf(Klass)) {
		return true;
	}
	
	return false;
}

export function toKeyNodeNumber(nodeKey: NodeKey): number {
    // Special case for root node
    if (nodeKey === "root") {
        return 0;
    }
    
    // Attempt to convert NodeKey (string) to a number
    const keyAsNumber = Number(nodeKey);
    if (!isNaN(keyAsNumber)) {
        return keyAsNumber;
    }
    
    // If conversion fails, throw an error
    throw new Error(`NodeKey "${nodeKey}" cannot be converted to a number. Expected numeric string or "root".`);
}

export function $diffTextContentAndApplyDelta(
  textNode: TextNode,
  key: NodeKey,
  prevText: string,
  nextText: string,
): void {
  
  const selection = $getSelection();
  let cursorOffset = nextText.length;

  if ($isRangeSelection(selection) && selection.isCollapsed()) {
    const anchor = selection.anchor;

    if (anchor.key === key) {
      // Ensure cursor offset doesn't exceed the new text length
      // This prevents errors when text is split or content changes significantly
      cursorOffset = Math.min(anchor.offset, nextText.length);
      
    }
  }

  const diff = simpleDiffWithCursor(prevText, nextText, cursorOffset);
  
  const beforeSplice = textNode.getTextContent();
  textNode.spliceText(diff.index, diff.remove, diff.insert);
  const afterSplice = textNode.getTextContent();
  
}
