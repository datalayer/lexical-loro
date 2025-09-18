import { TreeID, LoroTree } from 'loro-crdt';
import { 
  $createTextNode, 
  TextNode, 
  $isTextNode,
  TextFormatType,
  UpdateListenerPayload,
  NodeKey
} from 'lexical';
import { getNodeMapper } from '../nodes/NodesMapper';
import { LexicalNodeData, LexicalNodeDataHelper } from '../types/LexicalNodeData';

/**
 * TextNode Mutators for Loro Tree Collaboration
 * 
 * TextNode characteristics:
 * - Leaf nodes that represent text content
 * - Can have formatting (bold, italic, underline, strikethrough, etc.)
 * - Can have different modes: normal, token, segmented, inert
 * - Cannot have children (always leaf nodes)
 * - Support text content and format operations
 */

export interface TextNodeMutatorOptions {
  binding: any;
  tree: LoroTree;
  peerId: number;
}

/**
 * Create TextNode in Loro tree
 */
export function createTextNodeInLoro(
  nodeKey: NodeKey,
  textContent: string,
  format?: number,
  mode?: string,
  parentId?: TreeID,
  index?: number,
  lexicalNode?: any, // The actual Lexical TextNode instance
  options?: TextNodeMutatorOptions
): TreeID {
  const mapper = getNodeMapper();
  
  // Use mapper to get or create the tree node
  const treeNode = mapper.getLoroNodeByLexicalKey(
    nodeKey,
    lexicalNode,
    parentId,
    index
  );
  
  // Store TextNode metadata (these are still useful for debugging/logging)
  treeNode.data.set('textContent', textContent);
  treeNode.data.set('format', format || 0);
  treeNode.data.set('mode', mode || 'normal');
  
  // The exported Lexical node data is already handled by the mapper
  // Return the TreeID from the node's ID
  return treeNode.id;
}

/**
 * Update TextNode in Loro tree
 */
export function updateTextNodeInLoro(
  nodeKey: NodeKey,
  newTextContent?: string,
  format?: number,
  mode?: string,
  lexicalNode?: any, // The actual Lexical TextNode instance
  options?: TextNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Get the existing tree node using the mapper (don't pass lexicalNode to avoid context issues)
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey, undefined);
  
  // Store complete lexical node data if lexical node is provided
  if (lexicalNode) {
    const lexicalNodeData: LexicalNodeData = { lexicalNode };
    const serializedData = LexicalNodeDataHelper.serialize(lexicalNodeData);
    treeNode.data.set('lexical', serializedData);
  }
  
  // Update metadata
  if (newTextContent !== undefined) {
    treeNode.data.set('textContent', newTextContent);
  }
  if (format !== undefined) {
    treeNode.data.set('format', format);
  }
  if (mode !== undefined) {
    treeNode.data.set('mode', mode);
  }
  treeNode.data.set('updatedAt', Date.now());
  
  // The exported Lexical node data is already handled by the mapper
  // No additional JSON export needed since mapper handles exportJSON automatically
}

/**
 * Delete TextNode from Loro tree
 */
export function deleteTextNodeInLoro(
  nodeKey: NodeKey,
  options: TextNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  mapper.deleteMapping(nodeKey);
}

/**
 * Create TextNode in Lexical from Loro tree data
 */
export function createTextNodeFromLoro(
  treeId: TreeID,
  parentNode: any, // The Lexical parent node where this should be inserted
  index?: number,
  options?: TextNodeMutatorOptions
): TextNode | null {
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
  let textNode: TextNode;
  
  if (lexicalData && typeof lexicalData === 'string') {
    try {
      const deserializedData = LexicalNodeDataHelper.deserialize(lexicalData);
      const storedNode = deserializedData.lexicalNode;
      
      if (!$isTextNode(storedNode)) {
        return null;
      }
      
      // Use the stored lexical node directly
      textNode = storedNode;
    } catch (error) {
      console.warn('Failed to deserialize LexicalNodeData for TreeID:', treeId, error);
      return null;
    }
  } else {
    // Fallback to old format for backward compatibility
    const nodeType = treeNode.data.get('nodeType');
    if (nodeType !== 'text') {
      return null;
    }
    
    const textContent = treeNode.data.get('textContent');
    const safeTextContent = typeof textContent === 'string' ? textContent : '';
    textNode = $createTextNode(safeTextContent);
    
    // Apply formatting if present (only for old format)
    const format = treeNode.data.get('format');
    if (format && typeof format === 'number') {
      textNode.setFormat(format as unknown as TextFormatType);
    }
  }
  
  // Apply mode if present (only for old format)
  if (!lexicalData || typeof lexicalData !== 'string') {
    // const mode = treeNode.data.get('mode');
    // if (mode && typeof textNode.setMode === 'function') {
    //   textNode.setMode(mode);
    // }
  }
  
  // Insert into the parent at the specified index
  if (index !== undefined && index >= 0) {
    parentNode.splice(index, 0, [textNode]);
  } else {
    parentNode.append(textNode);
  }
  
  return textNode;
}

/**
 * Update TextNode in Lexical from Loro tree data
 */
export function updateTextNodeFromLoro(
  treeId: TreeID,
  lexicalNode: TextNode,
  newParentNode?: any,
  newIndex?: number,
  options?: TextNodeMutatorOptions
): void {
  const { tree } = options!;
  
  if (!tree.has(treeId)) {
    return;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode || treeNode.data.get('nodeType') !== 'text') {
    return;
  }
  
  // Update text content if it has changed
  const textContent = treeNode.data.get('textContent');
  if (textContent !== undefined && typeof textContent === 'string' && 
      lexicalNode.getTextContent() !== textContent) {
    lexicalNode.setTextContent(textContent);
  }
  
  // Update format if it has changed
  const format = treeNode.data.get('format');
  if (format !== undefined && typeof format === 'number') {
    lexicalNode.setFormat(format as unknown as TextFormatType);
  }
  
  // Update mode if it has changed (skip for now due to type complexity)
  // const mode = treeNode.data.get('mode');
  // if (mode !== undefined && typeof lexicalNode.setMode === 'function') {
  //   lexicalNode.setMode(mode);
  // }
  
  // If parent or position changed, move the node
  if (newParentNode && newIndex !== undefined) {
    // Remove from current location
    lexicalNode.remove();
    
    // Insert at new location
    newParentNode.splice(newIndex, 0, [lexicalNode]);
  }
}

/**
 * Delete TextNode from Lexical
 */
export function deleteTextNodeFromLoro(
  treeId: TreeID,
  lexicalNode: TextNode,
  options?: TextNodeMutatorOptions
): void {
  if ($isTextNode(lexicalNode)) {
    lexicalNode.remove();
  }
}

/**
 * Utility to check if a tree node represents a TextNode
 */
export function isTextNodeInTree(treeId: TreeID, tree: LoroTree): boolean {
  if (!tree.has(treeId)) {
    return false;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  return treeNode?.data.get('nodeType') === 'text';
}

/**
 * Get TextNode data from Loro tree
 */
export function getTextNodeDataFromTree(treeId: TreeID, tree: LoroTree): any {
  if (!tree.has(treeId)) {
    return null;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode || treeNode.data.get('nodeType') !== 'text') {
    return null;
  }
  
  return {
    nodeType: 'text',
    lexicalKey: treeNode.data.get('lexicalKey'),
    textContent: treeNode.data.get('textContent'),
    format: treeNode.data.get('format'),
    mode: treeNode.data.get('mode'),
    createdAt: treeNode.data.get('createdAt'),
    lastUpdated: treeNode.data.get('lastUpdated'),
  };
}

/**
 * Apply text formatting operations (bold, italic, etc.)
 */
export function applyTextFormatInLoro(
  nodeKey: NodeKey,
  formatType: TextFormatType,
  apply: boolean,
  options: TextNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Get the existing Loro node from the mapper
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey);
  if (!treeNode) {
    return;
  }
  if (!treeNode || treeNode.data.get('nodeType') !== 'text') {
    return;
  }
  
  let currentFormat = treeNode.data.get('format') || 0;
  const formatNumber = formatType as unknown as number;
  
  if (apply) {
    // Add the format flag
    currentFormat = (currentFormat as number) | formatNumber;
  } else {
    // Remove the format flag
    currentFormat = (currentFormat as number) & ~formatNumber;
  }
  
  treeNode.data.set('format', currentFormat);
  treeNode.data.set('lastUpdated', Date.now());
}

/**
 * Main mutate method for TextNode - handles all mutation types
 */
export function mutateTextNode(
  update: UpdateListenerPayload,
  mutation: 'created' | 'updated' | 'destroyed',
  nodeKey: NodeKey,
  options: TextNodeMutatorOptions
): void {
  const { tree, peerId } = options;

  switch (mutation) {
    case 'created': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isTextNode(currentNode)) {
        // Get parent and index for proper positioning using editor state context
        const { parent, parentId, index, textContent, format, mode } = update.editorState.read(() => {
          const parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          const parentId = parent ? mapper.getTreeIdByLexicalKey(parent.getKey()) : undefined;
          const index = currentNode.getIndexWithinParent();
          const textContent = currentNode.getTextContent();
          const format = currentNode.getFormat();
          const mode = currentNode.getMode();
          
          return { parent, parentId, index, textContent, format, mode };
        });
        
        createTextNodeInLoro(nodeKey, textContent, format, mode, parentId, index, currentNode, options);
      }
      break;
    }

    case 'updated': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isTextNode(currentNode)) {
        // Get updated text content and formatting using editor state context
        const { textContent, format, mode } = update.editorState.read(() => {
          const textContent = currentNode.getTextContent();
          const format = currentNode.getFormat();
          const mode = currentNode.getMode();
          
          return { textContent, format, mode };
        });
        
        updateTextNodeInLoro(nodeKey, textContent, format, mode, currentNode, options);
      }
      break;
    }

    case 'destroyed': {
      deleteTextNodeInLoro(nodeKey, options);
      break;
    }
  }
}