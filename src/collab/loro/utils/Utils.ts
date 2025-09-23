import { LoroDoc, TreeID } from 'loro-crdt';
import { $getNodeByKey, $getRoot, $getSelection, $isRangeSelection, $isTextNode, EditorState, ElementNode, LexicalNode, NodeKey, RangeSelection, TextNode } from 'lexical';
import simpleDiffWithCursor from '../../utils/simpleDiffWithCursor';

export const DEFAULT_TREE_NAME = 'lexical-tree';

/**
 * Ensure doc has a LoroTree instance
 */
export function getLoroTree(doc: LoroDoc, treeName = DEFAULT_TREE_NAME) {
  const tree = doc.getTree(treeName);
  // Enable fractional index for ordered siblings (useful for maintaining order)
  // tree.enableFractionalIndex(0.001);
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
	if (Klass.prototype && Object.prototype.isPrototypeOf.call(BaseClass, Klass)) {
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

export function doesSelectionNeedRecovering(
  selection: RangeSelection,
): boolean {
  const anchor = selection.anchor;
  const focus = selection.focus;
  let recoveryNeeded = false;

  try {
    const anchorNode = anchor.getNode();
    const focusNode = focus.getNode();

    if (
      // We might have removed a node that no longer exists
      !anchorNode.isAttached() ||
      !focusNode.isAttached() ||
      // If we've split a node, then the offset might not be right
      ($isTextNode(anchorNode) &&
        anchor.offset > anchorNode.getTextContentSize()) ||
      ($isTextNode(focusNode) && focus.offset > focusNode.getTextContentSize())
    ) {
      recoveryNeeded = true;
    }
  } catch (e) {
    // Sometimes checking nor a node via getNode might trigger
    // an error, so we need recovery then too.
    recoveryNeeded = true;
  }

  return recoveryNeeded;
}

export function $moveSelectionToPreviousNode(
  anchorNodeKey: string,
  currentEditorState: EditorState,
) {
  const anchorNode = currentEditorState._nodeMap.get(anchorNodeKey);
  if (!anchorNode) {
    $getRoot().selectStart();
    return;
  }
  // Get previous node
  const prevNodeKey = anchorNode.__prev;
  let prevNode: ElementNode | null = null;
  if (prevNodeKey) {
    prevNode = $getNodeByKey(prevNodeKey);
  }

  // If previous node not found, get parent node
  if (prevNode === null && anchorNode.__parent !== null) {
    prevNode = $getNodeByKey(anchorNode.__parent);
  }
  if (prevNode === null) {
    $getRoot().selectStart();
    return;
  }

  if (prevNode !== null && prevNode.isAttached()) {
    prevNode.selectEnd();
    return;
  } else {
    // If the found node is also deleted, select the next one
    $moveSelectionToPreviousNode(prevNode.__key, currentEditorState);
  }
}
