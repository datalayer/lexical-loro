import { TreeID, LoroTree } from 'loro-crdt';
import { 
  $createParagraphNode, 
  ElementNode, 
  $isElementNode,
  ElementFormatType, 
} from 'lexical';
import { getNodeMapper } from '../mappings/NodesMapper';

/**
 * ElementNode Mutators for Loro Tree Collaboration
 * 
 * ElementNode characteristics:
 * - Parent nodes that can contain other nodes (including other ElementNodes)
 * - Examples: ParagraphNode, HeadingNode, QuoteNode, LinkNode, etc.
 * - Can have formatting (bold, italic, etc.) and styles
 * - Can have children and maintain parent/child relationships
 * - Can be extended to create custom element types
 */

export interface ElementNodeMutatorOptions {
  binding: any;
  tree: LoroTree;
  peerId: number;
}

/**
 * Create ElementNode in Loro tree
 */
export function createElementNodeInLoro(
  nodeKey: number,
  elementType: string, // 'paragraph', 'heading', 'quote', 'link', etc.
  parentId?: TreeID,
  index?: number,
  metadata?: Record<string, any>,
  lexicalNode?: any, // The actual Lexical ElementNode instance
  options?: ElementNodeMutatorOptions
): TreeID {
  const mapper = getNodeMapper();
  
  // Use mapper to get or create the tree node
  const treeNode = mapper.getLoroNodeByLexicalKey(
    nodeKey.toString(),
    lexicalNode,
    parentId,
    index
  );
  
  // Store ElementNode metadata
  treeNode.data.set('nodeType', 'element');
  treeNode.data.set('elementType', elementType);
  
  // Store additional metadata if provided
  if (metadata) {
    Object.entries(metadata).forEach(([key, value]) => {
      treeNode.data.set(key, value);
    });
  }
  
  // The exported Lexical node data is already handled by the mapper
  // Return the TreeID from the node's ID
  return treeNode.id;
}

/**
 * Update ElementNode in Loro tree
 */
export function updateElementNodeInLoro(
  nodeKey: number,
  elementType?: string,
  parentId?: TreeID,
  index?: number,
  metadata?: Record<string, any>,
  lexicalNode?: any, // The actual Lexical ElementNode instance
  options?: ElementNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Get the existing tree node using the mapper
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey.toString(), lexicalNode);
  
  // Update element type if provided
  if (elementType !== undefined) {
    treeNode.data.set('elementType', elementType);
  }
  
  // Update metadata if provided
  if (metadata) {
    Object.entries(metadata).forEach(([key, value]) => {
      treeNode.data.set(key, value);
    });
  }
  
  // Move the node if parent or position changed
  if (parentId !== undefined || index !== undefined) {
    // Note: For moving, we need access to tree - this might need to be handled differently
    const { tree } = options!;
    tree.move(treeNode.id, parentId, index);
  }
      
  // The exported Lexical node data is already handled by the mapper
  // No additional JSON export needed since mapper handles exportJSON automatically
  
  treeNode.data.set('lastUpdated', Date.now());
}

/**
 * Delete ElementNode from Loro tree
 */
export function deleteElementNodeInLoro(
  nodeKey: number,
  options: ElementNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  mapper.deleteMapping(nodeKey.toString());
}

/**
 * Create ElementNode in Lexical from Loro tree data
 */
export function createElementNodeFromLoro(
  treeId: TreeID,
  parentNode: any, // The Lexical parent node where this should be inserted
  index?: number,
  options?: ElementNodeMutatorOptions
): ElementNode | null {
  const { tree } = options!;
  
  if (!tree.has(treeId)) {
    return null;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode || treeNode.data.get('nodeType') !== 'element') {
    return null;
  }
  
  const elementType = treeNode.data.get('elementType');
  let elementNode: ElementNode;
  
  // Create the appropriate element type
  switch (elementType) {
    case 'paragraph':
    default:
      // For now, create paragraphs for all element types
      // In a real implementation, you'd import specific element node creators
      // from their respective packages (e.g., @lexical/rich-text, @lexical/list, etc.)
      elementNode = $createParagraphNode();
      break;
  }
  
  // Apply any stored formatting or styles with proper type casting
  const format = treeNode.data.get('format');
  if (format && typeof elementNode.setFormat === 'function' && typeof format === 'number') {
    elementNode.setFormat(format as unknown as ElementFormatType);
  }
  
  const style = treeNode.data.get('style');
  if (style && typeof elementNode.setStyle === 'function' && typeof style === 'string') {
    elementNode.setStyle(style);
  }
  
  const direction = treeNode.data.get('direction');
  if (direction && typeof elementNode.setDirection === 'function' && 
      (direction === 'ltr' || direction === 'rtl')) {
    elementNode.setDirection(direction);
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
  newParentNode?: any,
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
  nodeKey: number,
  childKeys: string[],
  options: ElementNodeMutatorOptions
): void {
  const { tree, peerId } = options;
  const treeId: TreeID = `${nodeKey}@${peerId}`;
  
  if (!tree.has(treeId)) {
    return;
  }
  
  const treeNode = tree.getNodeByID(treeId);
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
  update: any, // UpdateListenerPayload
  mutation: 'created' | 'updated' | 'destroyed',
  nodeKey: number,
  options: ElementNodeMutatorOptions
): void {
  const { tree, peerId } = options;

  switch (mutation) {
    case 'created': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isElementNode(currentNode)) {
        // Get parent and index for proper positioning
        const parent = currentNode.getParent();
        const parentId = parent ? `${Number(parent.getKey())}@${peerId}` as TreeID : undefined;
        const index = currentNode.getIndexWithinParent();
        
        // Determine element type
        const elementType = currentNode.getType(); // 'paragraph', 'heading', etc.
        
        // Collect metadata (format, style, direction, etc.)
        const metadata: Record<string, any> = {};
        if (typeof currentNode.getFormat === 'function') {
          metadata.format = currentNode.getFormat();
        }
        if (typeof currentNode.getStyle === 'function') {
          metadata.style = currentNode.getStyle();
        }
        if (typeof currentNode.getDirection === 'function') {
          metadata.direction = currentNode.getDirection();
        }
        
        createElementNodeInLoro(nodeKey, elementType, parentId, index, metadata, currentNode, options);
      }
      break;
    }

    case 'updated': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isElementNode(currentNode)) {
        // Get current position
        const parent = currentNode.getParent();
        const parentId = parent ? `${Number(parent.getKey())}@${peerId}` as TreeID : undefined;
        const index = currentNode.getIndexWithinParent();
        
        // Get element type and metadata
        const elementType = currentNode.getType();
        const metadata: Record<string, any> = {};
        if (typeof currentNode.getFormat === 'function') {
          metadata.format = currentNode.getFormat();
        }
        if (typeof currentNode.getStyle === 'function') {
          metadata.style = currentNode.getStyle();
        }
        if (typeof currentNode.getDirection === 'function') {
          metadata.direction = currentNode.getDirection();
        }
        
        updateElementNodeInLoro(nodeKey, elementType, parentId, index, metadata, currentNode, options);
      }
      break;
    }

    case 'destroyed': {
      deleteElementNodeInLoro(nodeKey, options);
      break;
    }
  }
}