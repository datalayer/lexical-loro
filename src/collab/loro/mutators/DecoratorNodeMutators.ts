import { TreeID, LoroTree } from 'loro-crdt';
import { 
  DecoratorNode, 
  $isDecoratorNode,
  UpdateListenerPayload,
  NodeKey
} from 'lexical';
import { getNodeMapper } from '../nodes/NodesMapper';
import { LexicalNodeData, LexicalNodeDataHelper } from '../types/LexicalNodeData';
import { Binding } from '../Bindings';

/**
 * DecoratorNode Mutators for Loro Tree Collaboration
 * 
 * DecoratorNode characteristics:
 * - Wraps arbitrary view (React components, DOM nodes, etc.)
 * - Acts as opaque wrapper around external components
 * - Cannot have children in the traditional sense
 * - Renders through decorate() method which returns the view
 * - Examples: Images, Videos, Tweets, Charts, Custom Widgets
 */

export interface DecoratorNodeMutatorOptions {
  binding: Binding;
  tree: LoroTree;
  peerId: number;
}

/**
 * Create DecoratorNode in Loro tree
 */
export function createDecoratorNodeInLoro(
  nodeKey: NodeKey,
  decoratorType: string, // 'image', 'video', 'tweet', 'chart', etc.
  decoratorData: any, // The data needed to render the decorator
  parentId?: TreeID,
  index?: number,
  metadata?: Record<string, any>,
  serializedNodeData?: string, // Pre-serialized lexical node data
  options?: DecoratorNodeMutatorOptions
): TreeID {
  const mapper = getNodeMapper();
  
  // Use mapper to get or create the tree node (don't pass lexicalNode to avoid context issues)
  const treeNode = mapper.getLoroNodeByLexicalKey(
    nodeKey,
    undefined, // don't pass lexicalNode to avoid context issues
    parentId,
    index
  );
  
  // Store complete lexical node data if serialized data is provided
  if (serializedNodeData) {
    treeNode.data.set('lexical', serializedNodeData);
  }
  
  // Store DecoratorNode metadata (useful for debugging/logging)
  treeNode.data.set('elementType', 'decorator'); // Set element type for debug panel
  treeNode.data.set('decoratorType', decoratorType);
  treeNode.data.set('decoratorData', JSON.stringify(decoratorData));
  
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
 * Update DecoratorNode in Loro tree
 */
export function updateDecoratorNodeInLoro(
  nodeKey: NodeKey,
  decoratorType?: string,
  decoratorData?: any,
  parentId?: TreeID,
  index?: number,
  metadata?: Record<string, any>,
  serializedNodeData?: string, // Pre-serialized lexical node data
  options?: DecoratorNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Get the existing Loro node from the mapper
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey, undefined);
  if (!treeNode) {
    return;
  }
  
  const { tree } = options!;
  const treeId = treeNode.id;
  
  // Store complete lexical node data if serialized data is provided
  if (serializedNodeData) {
    treeNode.data.set('lexical', serializedNodeData);
  }
  
  // Update decorator type if provided
  if (decoratorType !== undefined) {
    treeNode.data.set('decoratorType', decoratorType);
  }
  
  // Update decorator data if provided
  if (decoratorData !== undefined) {
    treeNode.data.set('decoratorData', JSON.stringify(decoratorData));
  }
  
  // Update metadata if provided
  if (metadata) {
    Object.entries(metadata).forEach(([key, value]) => {
      treeNode.data.set(key, value);
    });
  }
  
  // Move the node if parent or position changed
  if (parentId !== undefined || index !== undefined) {
    tree.move(treeId, parentId, index);
  }
  
  // Update metadata
  treeNode.data.set('elementType', 'decorator'); // Ensure element type is set for debug panel
  treeNode.data.set('lastUpdated', Date.now());
}

/**
 * Delete DecoratorNode from Loro tree
 */
export function deleteDecoratorNodeInLoro(
  nodeKey: NodeKey,
  options: DecoratorNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Use the mapper's delete method which handles TreeID lookup internally
  mapper.deleteMapping(nodeKey);
}

/**
 * Create DecoratorNode in Lexical from Loro tree data
 * Note: This is a generic implementation. In practice, you'd need
 * specific decorator node classes for each type (ImageNode, VideoNode, etc.)
 */
export function createDecoratorNodeFromLoro(
  treeId: TreeID,
  parentNode: any, // The Lexical parent node where this should be inserted
  index?: number,
  options?: DecoratorNodeMutatorOptions
): DecoratorNode<any> | null {
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
  let decoratorNode: DecoratorNode<any>;
  
  if (lexicalData && typeof lexicalData === 'string') {
    try {
      const deserializedData = LexicalNodeDataHelper.deserialize(lexicalData);
      const storedNode = deserializedData.lexicalNode;
      
      if (!$isDecoratorNode(storedNode)) {
        return null;
      }
      
      // Use the stored lexical node directly
      decoratorNode = storedNode;
    } catch (error) {
      console.warn('Failed to deserialize LexicalNodeData for TreeID:', treeId, error);
      return null;
    }
  } else {
    // Fallback to old format for backward compatibility
    const nodeType = treeNode.data.get('nodeType');
    if (nodeType !== 'decorator') {
      return null;
    }
    
    const decoratorType = treeNode.data.get('decoratorType');
    const decoratorDataStr = treeNode.data.get('decoratorData');
    
    let decoratorData;
    try {
      decoratorData = decoratorDataStr && typeof decoratorDataStr === 'string' 
        ? JSON.parse(decoratorDataStr) : {};
    } catch (error) {
      console.warn('Failed to parse decorator data:', error);
      decoratorData = {};
    }
    
    // In a real implementation, you'd have a factory or registry
    // to create the appropriate decorator node type
    const safeDecoratorType = typeof decoratorType === 'string' ? decoratorType : 'generic';
    
    switch (safeDecoratorType) {
      case 'image':
        // decoratorNode = new ImageNode(decoratorData.src, decoratorData.alt, etc.);
        // For now, create a generic decorator placeholder
        decoratorNode = new GenericDecoratorNode(safeDecoratorType, decoratorData);
        break;
      case 'video':
        // decoratorNode = new VideoNode(decoratorData.src, decoratorData.controls, etc.);
        decoratorNode = new GenericDecoratorNode(safeDecoratorType, decoratorData);
        break;
      default:
        decoratorNode = new GenericDecoratorNode(safeDecoratorType, decoratorData);
        break;
    }
  }
  
  // Insert into the parent at the specified index
  if (index !== undefined && index >= 0) {
    parentNode.splice(index, 0, [decoratorNode]);
  } else {
    parentNode.append(decoratorNode);
  }
  
  return decoratorNode;
}

/**
 * Update DecoratorNode in Lexical from Loro tree data
 */
export function updateDecoratorNodeFromLoro(
  treeId: TreeID,
  lexicalNode: DecoratorNode<any>,
  newParentNode?: any,
  newIndex?: number,
  options?: DecoratorNodeMutatorOptions
): void {
  const { tree } = options!;
  
  if (!tree.has(treeId)) {
    return;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode || treeNode.data.get('nodeType') !== 'decorator') {
    return;
  }
  
  // Update decorator data if it has changed
  const decoratorDataStr = treeNode.data.get('decoratorData');
  let decoratorData;
  try {
    decoratorData = decoratorDataStr && typeof decoratorDataStr === 'string' 
      ? JSON.parse(decoratorDataStr) : {};
  } catch (error) {
    console.warn('Failed to parse decorator data:', error);
    decoratorData = {};
  }
  
  // Update the decorator's data (implementation depends on the specific decorator type)
  if (typeof (lexicalNode as any).updateData === 'function') {
    (lexicalNode as any).updateData(decoratorData);
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
 * Delete DecoratorNode from Lexical
 */
export function deleteDecoratorNodeFromLoro(
  treeId: TreeID,
  lexicalNode: DecoratorNode<any>,
  options?: DecoratorNodeMutatorOptions
): void {
  if ($isDecoratorNode(lexicalNode)) {
    lexicalNode.remove();
  }
}

/**
 * Utility to check if a tree node represents a DecoratorNode
 */
export function isDecoratorNodeInTree(treeId: TreeID, tree: LoroTree): boolean {
  if (!tree.has(treeId)) {
    return false;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  return treeNode?.data.get('nodeType') === 'decorator';
}

/**
 * Get DecoratorNode data from Loro tree
 */
export function getDecoratorNodeDataFromTree(treeId: TreeID, tree: LoroTree): any {
  if (!tree.has(treeId)) {
    return null;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode || treeNode.data.get('nodeType') !== 'decorator') {
    return null;
  }
  
  const decoratorDataStr = treeNode.data.get('decoratorData');
  let decoratorData;
  try {
    decoratorData = decoratorDataStr && typeof decoratorDataStr === 'string' 
      ? JSON.parse(decoratorDataStr) : {};
  } catch (error) {
    console.warn('Failed to parse decorator data:', error);
    decoratorData = {};
  }
  
  return {
    nodeType: 'decorator',
    decoratorType: treeNode.data.get('decoratorType'),
    lexicalKey: treeNode.data.get('lexicalKey'),
    decoratorData,
    createdAt: treeNode.data.get('createdAt'),
    lastUpdated: treeNode.data.get('lastUpdated'),
  };
}

/**
 * Generic DecoratorNode implementation for demonstration purposes
 * In a real application, you'd have specific decorator node classes
 */
class GenericDecoratorNode extends DecoratorNode<any> {
  __decoratorType: string;
  __decoratorData: any;

  constructor(decoratorType: string, decoratorData: any, key?: string) {
    super(key);
    this.__decoratorType = decoratorType;
    this.__decoratorData = decoratorData;
  }

  static getType(): string {
    return 'generic-decorator';
  }

  static clone(node: GenericDecoratorNode): GenericDecoratorNode {
    return new GenericDecoratorNode(
      node.__decoratorType,
      node.__decoratorData,
      node.__key
    );
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = `decorator-${this.__decoratorType}`;
    div.textContent = `[${this.__decoratorType}]`;
    return div;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): any {
    return {
      type: this.__decoratorType,
      data: this.__decoratorData,
    };
  }

  isInline(): boolean {
    return false;
  }

  updateData(newData: any): void {
    const writable = this.getWritable();
    writable.__decoratorData = newData;
  }
}

/**
 * Main mutate method for DecoratorNode - handles all mutation types
 */
export function mutateDecoratorNode(
  update: UpdateListenerPayload,
  mutation: 'created' | 'updated' | 'destroyed',
  nodeKey: NodeKey,
  options: DecoratorNodeMutatorOptions
): void {
  const { tree, peerId } = options;

  switch (mutation) {
    case 'created': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isDecoratorNode(currentNode)) {
        // Get node data and serialized data using editor state context
        const { parentId, index, decoratorType, decoratorData, metadata, serializedNodeData } = update.editorState.read(() => {
          // Get parent and index for proper positioning
          const parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          const parentId = parent ? mapper.getTreeIdByLexicalKey(parent.getKey()) : undefined;
          const index = currentNode.getIndexWithinParent();
          
          // Get decorator type and data
          const decoratorType = currentNode.getType();
          // For DecoratorNode, we'll store the node's internal data instead of calling decorate
          const decoratorData = (currentNode as any).__decoratorData || {};
          
          // Collect additional metadata
          const metadata: Record<string, any> = {};
          if (typeof currentNode.isInline === 'function') {
            metadata.isInline = currentNode.isInline();
          }
          
          // Serialize node data within editor context where node methods are available
          let serializedNodeData: string | undefined;
          try {
            const lexicalNodeData: LexicalNodeData = { lexicalNode: currentNode };
            serializedNodeData = LexicalNodeDataHelper.serialize(lexicalNodeData);
          } catch (error) {
            console.warn('Failed to serialize node data in mutateDecoratorNode created:', error);
          }
          
          return { parentId, index, decoratorType, decoratorData, metadata, serializedNodeData };
        });
        
        createDecoratorNodeInLoro(nodeKey, decoratorType, decoratorData, parentId, index, metadata, serializedNodeData, options);
      }
      break;
    }

    case 'updated': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isDecoratorNode(currentNode)) {
        // Get node data and serialized data using editor state context
        const { parentId, index, decoratorType, decoratorData, metadata, serializedNodeData } = update.editorState.read(() => {
          // Get current position
          const parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          const parentId = parent ? mapper.getTreeIdByLexicalKey(parent.getKey()) : undefined;
          const index = currentNode.getIndexWithinParent();
          
          // Get updated decorator type and data
          const decoratorType = currentNode.getType();
          // For DecoratorNode, we'll store the node's internal data instead of calling decorate
          const decoratorData = (currentNode as any).__decoratorData || {};
          
          // Collect metadata
          const metadata: Record<string, any> = {};
          if (typeof currentNode.isInline === 'function') {
            metadata.isInline = currentNode.isInline();
          }
          
          // Serialize node data within editor context where node methods are available
          let serializedNodeData: string | undefined;
          try {
            const lexicalNodeData: LexicalNodeData = { lexicalNode: currentNode };
            serializedNodeData = LexicalNodeDataHelper.serialize(lexicalNodeData);
          } catch (error) {
            console.warn('Failed to serialize node data in mutateDecoratorNode updated:', error);
          }
          
          return { parentId, index, decoratorType, decoratorData, metadata, serializedNodeData };
        });
        
        updateDecoratorNodeInLoro(nodeKey, decoratorType, decoratorData, parentId, index, metadata, serializedNodeData, options);
      }
      break;
    }

    case 'destroyed': {
      deleteDecoratorNodeInLoro(nodeKey, options);
      break;
    }
  }
}