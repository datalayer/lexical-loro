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
import { LexicalNodeData, LexicalNodeDataHelper } from '../types/LexicalNodeData';
import { Binding } from '../Bindings';

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
  serializedNodeData?: string, // Pre-serialized lexical node data
  options?: ElementNodeMutatorOptions
): TreeID {
  const mapper = getNodeMapper();
  
  // Use mapper to get or create the tree node (don't pass lexicalNode to avoid context issues)
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey, undefined, parentId, index);
  
  // Store complete lexical node data as JSON object (without the key) if serialized data is provided
  if (serializedNodeData) {
    try {
      const parsed = JSON.parse(serializedNodeData);
      const lexicalNodeData = parsed.lexicalNode;
      
      // Remove the key from lexical node data and store the cleaned object
      if (lexicalNodeData) {
        const cleanedLexicalData = { ...lexicalNodeData };
        delete cleanedLexicalData.key; // Remove the node key
        treeNode.data.set('lexical', cleanedLexicalData);
      }
    } catch (error) {
      console.warn('Failed to parse lexical node data for ElementNode:', error);
    }
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
  serializedNodeData?: string, // Pre-serialized lexical node data
  options?: ElementNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Get the existing tree node using the mapper (don't pass lexicalNode to avoid context issues)
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey, undefined);
  
  // Store complete lexical node data as JSON object (without the key) if serialized data is provided
  if (serializedNodeData) {
    try {
      const parsed = JSON.parse(serializedNodeData);
      const lexicalNodeData = parsed.lexicalNode;
      
      // Remove the key from lexical node data and store the cleaned object
      if (lexicalNodeData) {
        const cleanedLexicalData = { ...lexicalNodeData };
        delete cleanedLexicalData.key; // Remove the node key
        treeNode.data.set('lexical', cleanedLexicalData);
      }
    } catch (error) {
      console.warn('Failed to parse lexical node data for ElementNode update:', error);
    }
  }
  
  // Update only essential metadata
  if (elementType !== undefined) {
    treeNode.data.set('elementType', elementType);
  }
  
  // Move the node if parent or position changed
  if (parentId !== undefined || index !== undefined) {
    // Note: For moving, we need access to tree - this might need to be handled differently
    const { tree } = options!;
    
    // Debug: Check if the parent exists and its children count
    const parentNode = parentId ? tree.getNodeByID(parentId) : null;
    const parentChildCount = parentNode ? parentNode.children.length : tree.roots().length;
    
    console.log(`🔄 Moving node ${treeNode.id} to parent ${parentId} at index ${index}`);
    console.log(`🔄 Parent has ${parentChildCount} children, trying to move to index ${index}`);
    
    if (index !== undefined && index > parentChildCount) {
      console.warn(`🔄 Index ${index} is out of bounds for parent with ${parentChildCount} children. Adjusting to end.`);
      // Adjust index to be at the end instead of out of bounds
      tree.move(treeNode.id, parentId, parentChildCount);
    } else {
      tree.move(treeNode.id, parentId, index);
    }
  }
      
  // The exported Lexical node data is already handled by the mapper
  // No additional JSON export needed since mapper handles exportJSON automatically
  
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
  
  if (!tree.has(treeId)) {
    return null;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode) {
    return null;
  }
  
  // Try to get LexicalNodeData first (new format)
  const lexicalData = treeNode.data.get('lexical');
  let elementNode: ElementNode;
  
  if (lexicalData && typeof lexicalData === 'string') {
    try {
      const deserializedData = LexicalNodeDataHelper.deserialize(lexicalData);
      const storedNode = deserializedData.lexicalNode;
      
      if (!$isElementNode(storedNode)) {
        return null;
      }
      
      // Use the stored lexical node directly
      elementNode = storedNode;
    } catch (error) {
      console.warn('Failed to deserialize LexicalNodeData for TreeID:', treeId, error);
      return null;
    }
  } else {
    // Fallback to old format for backward compatibility
    const nodeType = treeNode.data.get('nodeType');
    if (nodeType !== 'element') {
      return null;
    }
    
    const elementType = treeNode.data.get('elementType');
    
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
  }
  
  // Apply any stored formatting or styles with proper type casting (only for old format)
  if (!lexicalData || typeof lexicalData !== 'string') {
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
  }  // Insert into the parent at the specified index
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
        // Serialize node data and collect metadata within editor context
        let parent: any, parentId: TreeID | undefined, index: number;
        let elementType: string, metadata: Record<string, any> = {};
        let serializedNodeData: string;
        
        update.editorState.read(() => {
          // Get parent and index for proper positioning within editor state context
          parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          parentId = parent ? mapper.getTreeIdByLexicalKey(parent.getKey()) : undefined;
          index = currentNode.getIndexWithinParent();
        
          // Determine element type
          elementType = currentNode.getType(); // 'paragraph', 'heading', etc.
          
          // Debug logging for table elements
          if (elementType.includes('table')) {
            console.log(`🔧 Creating table element: ${nodeKey} [${elementType}]`, {
              parentKey: parent?.getKey() || 'no-parent',
              parentType: parent?.getType() || 'N/A',
              parentId: parentId || 'no-parent-id',
              index,
              hasParentMapping: parent ? mapper.hasLexicalMapping(parent.getKey()) : false
            });
          }
          
          // If parent exists but doesn't have mapping yet, defer parent assignment
          if (parent && !parentId) {
            // Store the node creation but defer parent assignment
            parentId = undefined; // Create as orphan temporarily
            console.log(`⏳ Deferring parent assignment for ${nodeKey} [${elementType}] - parent ${parent.getKey()} not mapped yet`);
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
          
          // Serialize node data within editor context where node methods are available
          const lexicalNodeData: LexicalNodeData = { lexicalNode: currentNode };
          serializedNodeData = LexicalNodeDataHelper.serialize(lexicalNodeData);
        });
        
        // Create the node in Loro after safely reading from editor state
        createElementNodeInLoro(nodeKey, elementType, parentId, index, metadata, serializedNodeData, options);
        
        // If this node was created without a parent, schedule a retry to fix parent assignment
        if (parent && !parentId) {
          setTimeout(() => {
            console.log(`🔄 Retrying parent assignment for ${nodeKey} [${elementType}]`);
            const mapper = getNodeMapper();
            const retryParentId = mapper.getTreeIdByLexicalKey(parent.getKey());
            if (retryParentId) {
              // Move the node to its correct parent now that the parent exists
              const loroNode = mapper.getLoroNodeByLexicalKey(nodeKey);
              if (loroNode && tree.has(loroNode.id)) {
                tree.move(loroNode.id, retryParentId, index);
                console.log(`✅ Successfully assigned parent ${retryParentId} to ${nodeKey}`);
              }
            } else {
              console.log(`❌ Parent still not available for ${nodeKey} after retry`);
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
        
        // Serialize node data and collect metadata within editor context
        let serializedNodeData: string;
        
        update.editorState.read(() => {
          // Get current position within editor state context
          parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          parentId = parent ? mapper.getTreeIdByLexicalKey(parent.getKey()) : undefined;
          index = currentNode.getIndexWithinParent();
        
          // Get element type and metadata
          elementType = currentNode.getType();
          
          // Debug logging for table elements
          if (elementType.includes('table')) {
            console.log(`🔧 Updating table element: ${nodeKey} [${elementType}]`, {
              parentKey: parent?.getKey() || 'no-parent',
              parentType: parent?.getType() || 'N/A',
              parentId: parentId || 'no-parent-id',
              index,
              hasParentMapping: parent ? mapper.hasLexicalMapping(parent.getKey()) : false
            });
          }
          if (typeof currentNode.getFormat === 'function') {
            metadata.format = currentNode.getFormat();
          }
          if (typeof currentNode.getStyle === 'function') {
            metadata.style = currentNode.getStyle();
          }
          if (typeof currentNode.getDirection === 'function') {
            metadata.direction = currentNode.getDirection();
          }
          
          // Serialize node data within editor context where node methods are available
          const lexicalNodeData: LexicalNodeData = { lexicalNode: currentNode };
          serializedNodeData = LexicalNodeDataHelper.serialize(lexicalNodeData);
        });
        
        // Update the node in Loro after safely reading from editor state
        updateElementNodeInLoro(nodeKey, elementType, parentId, index, metadata, serializedNodeData, options);
      }
      break;
    }

    case 'destroyed': {
      deleteElementNodeInLoro(nodeKey, options);
      break;
    }
  }
}