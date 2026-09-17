/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { LoroDoc, TreeID, LoroTree, LoroTreeNode } from 'loro-crdt';
import { $getNodeByKey, $getRoot, $getSelection, $isRangeSelection, $isTextNode, EditorState, ElementNode, LexicalNode, NodeKey, RangeSelection, TextNode } from 'lexical';
import simpleDiffWithCursor from '../../utils/simpleDiffWithCursor';

export const DEFAULT_TREE_NAME = 'lexical-tree';

/**
 * Generates a consistent client ID from a Loro document.
 * Uses the numeric peer ID directly to ensure consistency across all components.
 * 
 * @param doc - The Loro document
 * @returns A number representing the client ID
 */
export function generateClientID(doc: LoroDoc): number {
  return Number(doc.peerId);
}

/**
 * Generates a client ID for cases where no document is available.
 * Creates a random ID within the safe integer range.
 * 
 * @returns A randomly generated client ID
 */
export function generateRandomClientID(): number {
  return Math.floor(Math.random() * 2147483647);
}

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
    prevNode = $getNodeByKey<ElementNode>(prevNodeKey);
  }

  // If previous node not found, get parent node
  if (prevNode === null && anchorNode.__parent !== null) {
    prevNode = $getNodeByKey<ElementNode>(anchorNode.__parent);
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

/**
 * Whether the tree holds this node as a live one.
 *
 * Loro keeps deleted nodes: `tree.has()` answers true for them and
 * `getNodeByID()` still hands them out, so a check on `has()` alone lets a
 * peer create, move under, or write to a node that is gone — and lets the
 * integrator recreate, in Lexical, a node the same batch deleted. Only
 * `isNodeDeleted()` tells, and it throws for an id the tree never saw.
 */
export function isLiveTreeNode(
  tree: LoroTree | undefined | null,
  treeId: TreeID | undefined | null,
): boolean {
  if (!tree || !treeId) {
    return false;
  }
  try {
    return tree.has(treeId) && !tree.isNodeDeleted(treeId);
  } catch {
    return false;
  }
}

/**
 * Write a value on a tree node's data only when it differs from what the
 * node holds.
 *
 * Every write is an op the room relays and every peer integrates; writing a
 * value that is already there sends the document round for nothing — and
 * when an editor re-commits what it just took from a peer (Lexical does,
 * recovering from a reconcile error), it is what turns one keystroke into an
 * avalanche: each side re-sends the other's data as its own, forever. A
 * write that changes nothing makes no op, so the echo dies where it starts.
 * `createdAt` is written once; a node keeps the time it was made.
 */
export function setNodeData(
  treeNode: LoroTreeNode,
  key: string,
  value: unknown,
): boolean {
  const current = treeNode.data.get(key);
  if (key === 'createdAt' && current !== undefined) {
    return false;
  }
  if (current !== undefined && sameValue(current, value)) {
    return false;
  }
  treeNode.data.set(key, value as never);
  return true;
}

/** Move a node only when it is not already where the move would put it. */
export function moveNodeIfNeeded(
  tree: LoroTree,
  treeId: TreeID,
  parentId: TreeID | undefined,
  index: number | undefined,
): boolean {
  const node = tree.getNodeByID(treeId);
  if (node) {
    const parent = node.parent();
    const currentParent = parent ? String(parent.id) : undefined;
    const wantedParent = parentId === undefined ? undefined : String(parentId);
    if (currentParent === wantedParent) {
      if (index === undefined) {
        return false;
      }
      const siblings = parent ? (parent.children() ?? []) : tree.roots();
      const currentIndex = siblings.findIndex(
        (sibling) => String(sibling.id) === String(treeId),
      );
      if (currentIndex === index) {
        return false;
      }
    }
  }
  tree.move(treeId, parentId, index);
  return true;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  try {
    const plain = (v: unknown) =>
      v && typeof (v as { toJSON?: unknown }).toJSON === 'function'
        ? (v as { toJSON: () => unknown }).toJSON()
        : v;
    return JSON.stringify(plain(a)) === JSON.stringify(plain(b));
  } catch {
    return false;
  }
}
