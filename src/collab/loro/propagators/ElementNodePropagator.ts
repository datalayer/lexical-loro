/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { TreeID, LoroTree } from 'loro-crdt';
import { 
  $createParagraphNode, 
  ElementNode, 
  $isElementNode,
  ElementFormatType,
  UpdateListenerPayload,
  NodeKey
} from 'lexical';
import { getNodeMapper } from '../nodes/NodesMapper';
import { LexicalNodeData } from '../types/LexicalNodeData';
import { createLexicalNodeFromLoro } from '../nodes/NodeFactory';
import { Binding } from '../Bindings';
import { invariant } from '../utils/Invariant';
import { isLiveTreeNode } from '../utils/Utils';

/**
 * ElementNode Propagator for Loro Tree Collaboration
 * 
 * ElementNode characteristics:
 * - Parent nodes that can contain other nodes (including other ElementNodes)
 * - Examples: ParagraphNode, HeadingNode, QuoteNode, LinkNode, etc.
 * - Can have formatting (bold, italic, etc.) and styles
 * - Can have children and maintain parent/child relationships
 * - Can be extended to create custom element types
 */

export interface ElementNodeMutatorOptions {
  binding: Binding;
  tree: LoroTree;
  peerId: number;
}

/**
 * Create ElementNode in Loro tree
 */
export function createElementNodeInLoro(
  nodeKey: NodeKey,
  elementType: string, // 'paragraph', 'heading', 'quote', 'link', etc.
  parentId?: TreeID,
  index?: number,
  metadata?: Record<string, any>,
  lexicalNodeJSON?: any, // JSON object from exportJSON()
  options?: ElementNodeMutatorOptions
): TreeID {
  const mapper = getNodeMapper();
  
  // Use mapper to get or create the tree node (don't pass lexicalNode to avoid context issues)
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey, undefined, parentId, index);
  
  // Store complete lexical node data as JSON object (without the key) if provided
  if (lexicalNodeJSON) {
    // Remove all key-related fields and children from lexical node data
    const { key, __key, lexicalKey, children, ...cleanedLexicalData } = lexicalNodeJSON;
    treeNode.data.set('lexical', cleanedLexicalData);
  }
  
  // Store only essential metadata (elementType for debug panel)
  treeNode.data.set('elementType', elementType);
  treeNode.data.set('createdAt', Date.now());
  
  // Return the TreeID from the node's ID
  return treeNode.id;
}

/**
 * Update ElementNode in Loro tree
 */
export function updateElementNodeInLoro(
  nodeKey: NodeKey,
  elementType?: string,
  parentId?: TreeID,
  index?: number,
  previousSiblingId?: TreeID,
  nextSiblingId?: TreeID,
  metadata?: Record<string, any>,
  lexicalNodeJSON?: any, // JSON object from exportJSON()
  options?: ElementNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Get the existing tree node using the mapper (don't pass lexicalNode to avoid context issues)
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey, undefined);
  
  // Store the lexical node data if provided
  if (lexicalNodeJSON) {
    const { key, __key, lexicalKey, children, ...cleanedLexicalData } = lexicalNodeJSON;
    treeNode.data.set('lexical', cleanedLexicalData);
  }
  
  // Update only essential metadata
  if (elementType !== undefined) {
    treeNode.data.set('elementType', elementType);
  }
  
  // Move the node only if its position in Loro actually differs from Lexical.
  if (parentId !== undefined || index !== undefined) {
    const { tree } = options!;

    // A node can never be its own parent — that indicates a wrong parent
    // mapping upstream, not something to silently skip.
    invariant(
      !(parentId && treeNode.id === parentId),
      'updateElementNodeInLoro: cycle move (node is its own parent)',
      { nodeKey, treeId: treeNode.id },
    );

    // Where does the node currently sit in the Loro tree?
    const currentParent = treeNode.parent();
    const currentParentId = currentParent ? currentParent.id : undefined;
    const siblings = currentParent ? (currentParent.children() ?? []) : tree.roots();
    const currentIndex = siblings.findIndex(child => child.id === treeNode.id);

    const sameParent = currentParentId === parentId;

    // Re-issuing a move on every content edit is unnecessary and races with
    // sibling creation (the classic source of "index out of range"). Only move
    // when the parent or index genuinely changed. This is a real no-op check,
    // not a masked failure.
    const needsMove =
      !sameParent || (index !== undefined && index !== currentIndex);

    if (needsMove) {
      const parentNode = parentId ? tree.getNodeByID(parentId) : null;
      const parentChildCount = parentNode
        ? (parentNode.children()?.length ?? 0)
        : tree.roots().length;

      if (index !== undefined) {
        // Loro move index bounds:
        //   same-parent reorder : [0, children.length - 1]
        //   cross-parent move   : [0, children.length]
        // An index outside this range means the position was computed against
        // siblings that are not yet synced. Before failing, resolve index
        // from mapped sibling anchors when available.
        let targetIndex = index;
        const maxIndex = sameParent
          ? Math.max(parentChildCount - 1, 0)
          : parentChildCount;

        if (targetIndex < 0 || targetIndex > maxIndex) {
          const targetSiblings = parentNode
            ? (parentNode.children() ?? [])
            : tree.roots();

          if (previousSiblingId) {
            const prevIndex = targetSiblings.findIndex(child => child.id === previousSiblingId);
            if (prevIndex >= 0) {
              targetIndex = prevIndex + 1;
            }
          }

          if ((targetIndex < 0 || targetIndex > maxIndex) && nextSiblingId) {
            const nextIndex = targetSiblings.findIndex(child => child.id === nextSiblingId);
            if (nextIndex >= 0) {
              targetIndex = nextIndex;
            }
          }

          // A move can observe transiently sparse sibling mappings within one
          // update batch (e.g. pressing Enter at the end of the document, where
          // the sibling created in the same batch is not yet mapped). When the
          // anchors cannot resolve the position, clamp into the valid Loro range
          // instead of throwing: a hard failure rolls back the user's keystroke,
          // whereas a bounded placement still converges via the CRDT and can be
          // refined by subsequent updates.
          if (targetIndex < 0 || targetIndex > maxIndex) {
            const clamped = Math.min(Math.max(targetIndex, 0), maxIndex);
            console.warn(
              `[loro-collab] updateElementNodeInLoro: clamping out-of-range move index`,
              {
                nodeKey,
                treeId: treeNode.id,
                index,
                targetIndex,
                clamped,
                maxIndex,
                sameParent,
                previousSiblingId,
                nextSiblingId,
              },
            );
            targetIndex = clamped;
          }
        }

        tree.move(treeNode.id, parentId, targetIndex);
      } else {
        tree.move(treeNode.id, parentId, parentChildCount);
      }
    }
  }

  // The exported Lexical node data is already propagated by the mapper.
  treeNode.data.set('lastUpdated', Date.now());
}

/**
 * Delete ElementNode from Loro tree
 */
export function deleteElementNodeInLoro(
  nodeKey: NodeKey,
  options: ElementNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  mapper.deleteMapping(nodeKey);
}

/**
 * Create ElementNode in Lexical from Loro tree data
 */
export function createElementNodeFromLoro(
  treeId: TreeID,
  parentNode: ElementNode, // The Lexical parent node where this should be inserted
  index?: number,
  options?: ElementNodeMutatorOptions
): ElementNode | null {
  const { tree } = options!;
  
  if (!isLiveTreeNode(tree, treeId)) {
    return null;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode) {
    return null;
  }
  
  // Get LexicalNodeData (JSON object format only)
  const lexicalData = treeNode.data.get('lexical');
  let elementNode: ElementNode;
  
  if (lexicalData && typeof lexicalData === 'object') {
    try {
      // lexicalData is a direct JSON object, create the appropriate node type
      const lexicalDataObj = lexicalData as any;
      const nodeType = lexicalDataObj.type || lexicalDataObj.__type;
      
      if (nodeType === 'paragraph') {
        elementNode = $createParagraphNode();
      } else {
        // For other node types, fall back to paragraph for now
        console.warn(`Unsupported ElementNode type: ${nodeType}, creating paragraph instead`);
        elementNode = $createParagraphNode();
      }
      
      // Apply formatting if available
      if (lexicalDataObj.format || lexicalDataObj.__format) {
        elementNode.setFormat(lexicalDataObj.format || lexicalDataObj.__format);
      }
      
    } catch (error) {
      console.warn('Failed to create ElementNode from JSON data for TreeID:', treeId, error);
      return null;
    }
  } else {
    // No lexical JSON data found - cannot create ElementNode
    console.warn('No lexical JSON data found for ElementNode TreeID:', treeId);
    return null;
  }
  
  // Insert into the parent at the specified index
  if (index !== undefined && index >= 0) {
    parentNode.splice(index, 0, [elementNode]);
  } else {
    parentNode.append(elementNode);
  }
  
  return elementNode;
}

/**
 * Update ElementNode in Lexical from Loro tree data
 */
export function updateElementNodeFromLoro(
  treeId: TreeID,
  lexicalNode: ElementNode,
  newParentNode?: ElementNode,
  newIndex?: number,
  options?: ElementNodeMutatorOptions
): void {
  const { tree } = options!;
  
  if (!isLiveTreeNode(tree, treeId)) {
    return;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode || treeNode.data.get('nodeType') !== 'element') {
    return;
  }
  
  // Update formatting if it has changed
  const format = treeNode.data.get('format');
  if (format !== undefined && typeof lexicalNode.setFormat === 'function' && typeof format === 'number') {
    lexicalNode.setFormat(format as unknown as ElementFormatType);
  }
  
  const style = treeNode.data.get('style');
  if (style !== undefined && typeof lexicalNode.setStyle === 'function' && typeof style === 'string') {
    lexicalNode.setStyle(style);
  }
  
  const direction = treeNode.data.get('direction');
  if (direction !== undefined && typeof lexicalNode.setDirection === 'function' && 
      (direction === 'ltr' || direction === 'rtl')) {
    lexicalNode.setDirection(direction);
  }
  
  // If parent or position changed, move the node
  if (newParentNode && newIndex !== undefined) {
    // Remove from current location
    lexicalNode.remove();
    
    // Insert at new location
    newParentNode.splice(newIndex, 0, [lexicalNode]);
  }
}

/**
 * Delete ElementNode from Lexical
 */
export function deleteElementNodeFromLoro(
  treeId: TreeID,
  lexicalNode: ElementNode,
  options?: ElementNodeMutatorOptions
): void {
  if ($isElementNode(lexicalNode)) {
    lexicalNode.remove();
  }
}

/**
 * Utility to check if a tree node represents an ElementNode
 */
export function isElementNodeInTree(treeId: TreeID, tree: LoroTree): boolean {
  if (!isLiveTreeNode(tree, treeId)) {
    return false;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  return treeNode?.data.get('nodeType') === 'element';
}

/**
 * Get ElementNode data from Loro tree
 */
export function getElementNodeDataFromTree(treeId: TreeID, tree: LoroTree): any {
  if (!isLiveTreeNode(tree, treeId)) {
    return null;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode || treeNode.data.get('nodeType') !== 'element') {
    return null;
  }
  
  return {
    nodeType: 'element',
    elementType: treeNode.data.get('elementType'),
    format: treeNode.data.get('format'),
    style: treeNode.data.get('style'),
    direction: treeNode.data.get('direction'),
    level: treeNode.data.get('level'), // For headings
    createdAt: treeNode.data.get('createdAt'),
    lastUpdated: treeNode.data.get('lastUpdated'),
  };
}

/**
 * Sync ElementNode children relationships in Loro tree
 */
export function syncElementNodeChildrenInLoro(
  nodeKey: NodeKey,
  childKeys: string[],
  options: ElementNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  const { tree } = options;
  
  // Get the existing Loro node from the mapper
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey);
  if (!treeNode || treeNode.data.get('nodeType') !== 'element') {
    return;
  }
  
  // Store children relationships for collaborative editing
  treeNode.data.set('childKeys', childKeys);
  treeNode.data.set('childrenLastUpdated', Date.now());
}

/**
 * Main propagate method for ElementNode - propagates all mutation types
 */
export function propagateElementNode(
  update: UpdateListenerPayload,
  mutation: 'created' | 'updated' | 'destroyed',
  nodeKey: NodeKey,
  options: ElementNodeMutatorOptions
): void {
  const { tree, peerId } = options;

  switch (mutation) {
    case 'created': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isElementNode(currentNode)) {
        // Export node data and collect metadata within editor context
        let parent: any, parentId: TreeID | undefined, index: number;
        let elementType: string;
        const metadata: Record<string, any> = {};
        let lexicalNodeJSON: any;
        
        update.editorState.read(() => {
          // Get parent and index for proper positioning within editor state context
          parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          parentId = parent ? mapper.getTreeIDByLexicalKey(parent.getKey()) : undefined;
          index = currentNode.getIndexWithinParent();
          
          if (parentId) {
            const ownTreeID = mapper.getTreeIDByLexicalKey(nodeKey);
            if (ownTreeID === parentId) {
              parentId = undefined; // Prevent cycle
            }
          }
        
          // Determine element type
          elementType = currentNode.getType(); // 'paragraph', 'heading', etc.
          
          // If parent exists but doesn't have mapping yet, this shouldn't happen
          // because SyncLexicalToLoro sorts element mutations by depth.
          // But as a safety net, log a warning.
          if (parent && !parentId) {
            console.warn(` ElementNodePropagator: parent mapping missing for ${elementType} nodeKey=${nodeKey}, parentKey=${parent.getKey()}`);
          }
        
          // Collect metadata (format, style, direction, etc.)
          if (typeof currentNode.getFormat === 'function') {
            metadata.format = currentNode.getFormat();
          }
          if (typeof currentNode.getStyle === 'function') {
            metadata.style = currentNode.getStyle();
          }
          if (typeof currentNode.getDirection === 'function') {
            metadata.direction = currentNode.getDirection();
          }
          
          // Export node data within editor context where node methods are available
          lexicalNodeJSON = currentNode.exportJSON();
        });
        
        // Create the node in Loro after safely reading from editor state
        createElementNodeInLoro(nodeKey, elementType, parentId, index, metadata, lexicalNodeJSON, options);
      }
      break;
    }

    case 'updated': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isElementNode(currentNode)) {
        // Use editorState.read() to safely access node methods
        let parent: any, parentId: TreeID | undefined, index: number;
        let previousSiblingId: TreeID | undefined;
        let nextSiblingId: TreeID | undefined;
        let elementType: string;
        const metadata: Record<string, any> = {};
        
        // Export node data and collect metadata within editor context
        let lexicalNodeJSON: any;
        
        update.editorState.read(() => {
          // Get current position within editor state context
          parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          parentId = parent ? mapper.getTreeIDByLexicalKey(parent.getKey()) : undefined;
          index = currentNode.getIndexWithinParent();

          // Resolve nearest mapped sibling anchors to stabilize target index
          // when Lexical index includes siblings not yet represented in Loro.
          if (parent) {
            const siblings = parent.getChildren();
            for (let i = index - 1; i >= 0; i--) {
              const candidate = siblings[i];
              const candidateTreeId = mapper.getTreeIDByLexicalKey(candidate.getKey());
              if (candidateTreeId && isLiveTreeNode(tree, candidateTreeId)) {
                previousSiblingId = candidateTreeId;
                break;
              }
            }
            for (let i = index + 1; i < siblings.length; i++) {
              const candidate = siblings[i];
              const candidateTreeId = mapper.getTreeIDByLexicalKey(candidate.getKey());
              if (candidateTreeId && isLiveTreeNode(tree, candidateTreeId)) {
                nextSiblingId = candidateTreeId;
                break;
              }
            }
          }
        
          // Get element type and metadata
          elementType = currentNode.getType();
          
          if (typeof currentNode.getFormat === 'function') {
            metadata.format = currentNode.getFormat();
          }
          if (typeof currentNode.getStyle === 'function') {
            metadata.style = currentNode.getStyle();
          }
          if (typeof currentNode.getDirection === 'function') {
            metadata.direction = currentNode.getDirection();
          }
          
          // Export node data within editor context where node methods are available
          lexicalNodeJSON = currentNode.exportJSON();
        });
        
        // Update the node in Loro after safely reading from editor state
        updateElementNodeInLoro(
          nodeKey,
          elementType,
          parentId,
          index,
          previousSiblingId,
          nextSiblingId,
          metadata,
          lexicalNodeJSON,
          options,
        );
      }
      break;
    }

    case 'destroyed': {
      deleteElementNodeInLoro(nodeKey, options);
      break;
    }
  }
}