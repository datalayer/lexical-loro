/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import {
  $getRoot,
  type LexicalNode,
  $getNodeByKey,
  type NodeKey,
  $isTextNode,
  $isElementNode,
  $getState,
  $setState
} from 'lexical';
import { stableNodeIdState } from './stableNodeState';
import type { StablePosition } from './types';

// ============================================================================
// STABLE NODE UUID SYSTEM using Lexical NodeState
// ============================================================================

/**
 * Generate a stable UUID for nodes
 */
export function generateStableNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get or create a stable UUID for a Lexical node using NodeState
 */
export function $getStableNodeId(node: LexicalNode): string {
  let stableId = $getState(node, stableNodeIdState);
  if (!stableId) {
    stableId = generateStableNodeId();
    $setState(node, stableNodeIdState, stableId);
  }
  return stableId;
}

// ============================================================================
// STABLE CURSOR POSITION FUNCTIONS - UUID Based (No Performance Issues)
// ============================================================================

/**
 * Create stable position data from Lexical selection point using UUID
 * This replaces NodeKey-based approach with stable UUIDs
 * Must be called within editor.getEditorState().read() or editor.update()
 */
export function $createStablePositionFromPoint(point: {key: NodeKey, offset: number}): StablePosition | null {
  const node = $getNodeByKey(point.key);
  if (!node) {
    console.warn('❌ Node not found for key:', point.key);
    return null;
  }

  // Get or create stable UUID for this node
  const stableNodeId = $getStableNodeId(node);
  
  return {
    stableNodeId,
    offset: point.offset,
    type: $isTextNode(node) ? 'text' : 'element'
  };
}

/**
 * Find a node by its stable UUID (traverses the document tree)
 * This is the reverse operation - finding node by stable ID
 */
export function $findNodeByStableId(stableNodeId: string): LexicalNode | null {
  const root = $getRoot();
  
  // Traverse the document tree to find node with matching stable ID
  function traverse(node: LexicalNode): LexicalNode | null {
    // Check if this node has the stable ID we're looking for
    const nodeStableId = $getState(node, stableNodeIdState);
    if (nodeStableId === stableNodeId) {
      return node;
    }
    
    // If this is an element node, traverse its children
    if ($isElementNode(node)) {
      const children = node.getChildren();
      for (const child of children) {
        const found = traverse(child);
        if (found) return found;
      }
    }
    
    return null;
  }
  
  return traverse(root);
}

/**
 * Convert stable position back to NodeKey and offset for Lexical operations
 * This allows compatibility with existing cursor positioning code
 */
export function $resolveStablePosition(stablePos: StablePosition): {key: NodeKey, offset: number} | null {
  const node = $findNodeByStableId(stablePos.stableNodeId);
  if (!node) {
    console.warn('❌ Could not find node for stable ID:', stablePos.stableNodeId, '- using document end fallback');
    
    // ROBUST FALLBACK: When stable UUID can't be resolved (node doesn't exist yet),
    // position cursor at end of document instead of failing
    const root = $getRoot();
    const children = root.getChildren();
    
    // Find the last text node in the document
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if ($isElementNode(child)) {
        const textChildren = child.getChildren().filter($isTextNode);
        if (textChildren.length > 0) {
          const lastText = textChildren[textChildren.length - 1];
          console.log('✅ Fallback: Using end of last text node:', {
            nodeKey: lastText.getKey(),
            textLength: lastText.getTextContentSize(),
            stableIdThatFailed: stablePos.stableNodeId
          });
          return {
            key: lastText.getKey(),
            offset: lastText.getTextContentSize()
          };
        }
      }
    }
    
    // If no text nodes found, use root
    console.log('✅ Fallback: Using root node (no text nodes found)');
    return {
      key: root.getKey(),
      offset: 0
    };
  }
  
  return {
    key: node.getKey(),
    offset: stablePos.offset
  };
}

/**
 * Ensure all nodes in the document have stable UUIDs
 * This should be called after document updates to maintain stability
 */
export function $ensureAllNodesHaveStableIds(): void {
  const root = $getRoot();
  
  function traverse(node: LexicalNode): void {
    // Ensure this node has a stable ID
    $getStableNodeId(node);
    
    // If this is an element node, traverse its children
    if ($isElementNode(node)) {
      const children = node.getChildren();
      for (const child of children) {
        traverse(child);
      }
    }
  }
  
  traverse(root);
}
