import { TreeID, LoroTree } from 'loro-crdt';
import { 
  DecoratorNode, 
  $isDecoratorNode,
  UpdateListenerPayload,
  NodeKey,
  ElementNode
} from 'lexical';
import { getNodeMapper } from '../nodes/NodesMapper';
import { LexicalNodeData } from '../types/LexicalNodeData';
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
  lexicalNodeJSON?: any, // JSON object from exportJSON()
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
  
  // Store complete lexical node data as clean JSON if provided
  if (lexicalNodeJSON) {
    // Store complete lexical JSON without the key
    const { key, ...cleanedData } = lexicalNodeJSON;
    treeNode.data.set('lexical', cleanedData);
  }
  
  // Store only essential metadata
  treeNode.data.set('elementType', 'decorator');
  treeNode.data.set('createdAt', Date.now());
  
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
  lexicalNodeJSON?: any, // JSON object from exportJSON()
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
  
  // Store complete lexical node data as clean JSON if provided
  if (lexicalNodeJSON) {
    // Store complete lexical JSON without the key
    const { key, ...cleanedData } = lexicalNodeJSON;
    treeNode.data.set('lexical', cleanedData);
  }
  
  // All decorator information is now contained in lexical data object
  
  // Move the node if parent or position changed
  if (parentId !== undefined || index !== undefined) {
    tree.move(treeId, parentId, index);
  }
  
  // Update only essential metadata
  treeNode.data.set('elementType', 'decorator');
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
  parentNode: ElementNode,
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
  
  // Get LexicalNodeData (JSON object format only)
  const lexicalData = treeNode.data.get('lexical');
  let decoratorNode: DecoratorNode<any>;
  
  if (lexicalData && typeof lexicalData === 'object') {
    // For DecoratorNode, we need to handle this case appropriately
    // But DecoratorNodes are complex and might need special handling
    console.warn(`DecoratorNode creation from JSON object not fully implemented for TreeID: ${treeId}`);
    return null;
  } else {
    // No lexical JSON data found - cannot create DecoratorNode
    console.warn('No lexical JSON data found for DecoratorNode TreeID:', treeId);
    return null;
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
  newParentNode?: ElementNode,
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
        // Get node data using editor state context
        const { parentId, index, decoratorType, decoratorData, metadata, lexicalNodeJSON } = update.editorState.read(() => {
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
          
          // Export node data within editor context where node methods are available
          let lexicalNodeJSON: any = undefined;
          try {
            lexicalNodeJSON = currentNode.exportJSON();
          } catch (error) {
            console.warn('Failed to export node data in mutateDecoratorNode created:', error);
          }
          
          return { parentId, index, decoratorType, decoratorData, metadata, lexicalNodeJSON };
        });
        
        createDecoratorNodeInLoro(nodeKey, decoratorType, decoratorData, parentId, index, metadata, lexicalNodeJSON, options);
      }
      break;
    }

    case 'updated': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isDecoratorNode(currentNode)) {
        // Get node data using editor state context
        const { parentId, index, decoratorType, decoratorData, metadata, lexicalNodeJSON } = update.editorState.read(() => {
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
          
          // Export node data within editor context where node methods are available
          let lexicalNodeJSON: any = undefined;
          try {
            lexicalNodeJSON = currentNode.exportJSON();
          } catch (error) {
            console.warn('Failed to export node data in mutateDecoratorNode updated:', error);
          }
          
          return { parentId, index, decoratorType, decoratorData, metadata, lexicalNodeJSON };
        });
        
        updateDecoratorNodeInLoro(nodeKey, decoratorType, decoratorData, parentId, index, metadata, lexicalNodeJSON, options);
      }
      break;
    }

    case 'destroyed': {
      deleteDecoratorNodeInLoro(nodeKey, options);
      break;
    }
  }
}