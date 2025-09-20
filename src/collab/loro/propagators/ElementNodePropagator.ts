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
    // Remove the key from lexical node data and store the cleaned object
    const { key, ...cleanedLexicalData } = lexicalNodeJSON;
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
  metadata?: Record<string, any>,
  lexicalNodeJSON?: any, // JSON object from exportJSON()
  options?: ElementNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Get the existing tree node using the mapper (don't pass lexicalNode to avoid context issues)
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey, undefined);
  
  // Store complete lexical node data as JSON object (without the key) if provided
  if (lexicalNodeJSON) {
    // Remove the key from lexical node data and store the cleaned object
    const { key, ...cleanedLexicalData } = lexicalNodeJSON;
    treeNode.data.set('lexical', cleanedLexicalData);
  }
  
  // Update only essential metadata
  if (elementType !== undefined) {
    treeNode.data.set('elementType', elementType);
  }
  
  // Move the node if parent or position changed
  if (parentId !== undefined || index !== undefined) {
    // Note: For moving, we need access to tree - this might need to be handled differently
    const { tree } = options!;
    
    // CRITICAL: Prevent cycle moves - a node cannot be its own parent
    if (parentId && treeNode.id === parentId) {
      console.warn(`🚨 CYCLE MOVE DETECTED: Node ${treeNode.id} cannot be its own parent! Skipping move operation.`);
      return;
    }
    
    // Debug: Check if the parent exists and its children count
    const parentNode = parentId ? tree.getNodeByID(parentId) : null;
    const parentChildCount = parentNode ? parentNode.children.length : tree.roots().length;
    
    // Check if the node is already a child of the target parent
    const currentParent = treeNode.parent();
    const isAlreadyChild = currentParent?.id === parentId;
    
    if (index !== undefined) {
      let adjustedIndex = index;
      
      if (!isAlreadyChild) {
        // Moving to a new parent - check bounds against current child count
        if (index > parentChildCount) {
          adjustedIndex = parentChildCount;
        }
      }
      
      tree.move(treeNode.id, parentId, adjustedIndex);
    } else {
      // No specific index, append to end
      tree.move(treeNode.id, parentId, parentChildCount);
    }
  }
      
  // The exported Lexical node data is already handled by the mapper
  // No additional JSON export needed since mapper handles exportJSON automatically
  
  try {
    treeNode.data.set('lastUpdated', Date.now());
  } catch (error) {
    console.warn(`🔄 ElementNode ${treeNode.id} container deleted during timestamp update (normal during operations):`, error.message);
  }
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
  
  if (!tree.has(treeId)) {
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
  
  if (!tree.has(treeId)) {
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
  if (!tree.has(treeId)) {
    return false;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  return treeNode?.data.get('nodeType') === 'element';
}

/**
 * Get ElementNode data from Loro tree
 */
export function getElementNodeDataFromTree(treeId: TreeID, tree: LoroTree): any {
  if (!tree.has(treeId)) {
    return null;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode || treeNode.data.get('nodeType') !== 'element') {
    return null;
  }
  
  return {
    nodeType: 'element',
    elementType: treeNode.data.get('elementType'),
    lexicalKey: treeNode.data.get('lexicalKey'),
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
 * Main mutate method for ElementNode - handles all mutation types
 */
export function mutateElementNode(
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
        let elementType: string, metadata: Record<string, any> = {};
        let lexicalNodeJSON: any;
        
        update.editorState.read(() => {
          // Get parent and index for proper positioning within editor state context
          parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          parentId = parent ? mapper.getTreeIdByLexicalKey(parent.getKey()) : undefined;
          index = currentNode.getIndexWithinParent();
          
          if (parentId) {
            const ownTreeId = mapper.getTreeIdByLexicalKey(nodeKey);
            if (ownTreeId === parentId) {
              parentId = undefined; // Prevent cycle
            }
          }
        
          // Determine element type
          elementType = currentNode.getType(); // 'paragraph', 'heading', etc.
          
          // If parent exists but doesn't have mapping yet, defer parent assignment
          if (parent && !parentId) {
            // Store the node creation but defer parent assignment
            parentId = undefined; // Create as orphan temporarily
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
        
        // If this node was created without a parent, schedule a retry to fix parent assignment
        if (parent && !parentId) {
          setTimeout(() => {
            const mapper = getNodeMapper();
            const retryParentId = mapper.getTreeIdByLexicalKey(parent.getKey());
            if (retryParentId) {
              // Move the node to its correct parent now that the parent exists
              const loroNode = mapper.getLoroNodeByLexicalKey(nodeKey);
              if (loroNode && tree.has(loroNode.id)) {
                tree.move(loroNode.id, retryParentId, index);
              }
            }
          }, 10); // Small delay to allow parent to be created
        }
      }
      break;
    }

    case 'updated': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isElementNode(currentNode)) {
        // Use editorState.read() to safely access node methods
        let parent: any, parentId: TreeID | undefined, index: number;
        let elementType: string, metadata: Record<string, any> = {};
        
        // Export node data and collect metadata within editor context
        let lexicalNodeJSON: any;
        
        update.editorState.read(() => {
          // Get current position within editor state context
          parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          parentId = parent ? mapper.getTreeIdByLexicalKey(parent.getKey()) : undefined;
          index = currentNode.getIndexWithinParent();
        
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
        updateElementNodeInLoro(nodeKey, elementType, parentId, index, metadata, lexicalNodeJSON, options);
      }
      break;
    }

    case 'destroyed': {
      deleteElementNodeInLoro(nodeKey, options);
      break;
    }
  }
}