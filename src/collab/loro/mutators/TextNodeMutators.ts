import { TreeID, LoroTree } from 'loro-crdt';
import { 
  $createTextNode, 
  TextNode, 
  $isTextNode,
  TextFormatType
} from 'lexical';

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
  nodeKey: string,
  textContent: string,
  format?: number,
  mode?: string,
  parentId?: TreeID,
  index?: number,
  lexicalNode?: any, // The actual Lexical TextNode instance
  options?: TextNodeMutatorOptions
): TreeID {
  const { tree, peerId } = options!;
  const treeId: TreeID = `${Number(nodeKey)}@${peerId}`;
  
  // Create the tree node
  const treeNode = tree.createNode(parentId, index);
  
  // Store TextNode metadata
  treeNode.data.set('nodeType', 'text');
  treeNode.data.set('lexicalKey', nodeKey);
  treeNode.data.set('textContent', textContent);
  treeNode.data.set('format', format || 0);
  treeNode.data.set('mode', mode || 'normal');
  treeNode.data.set('createdAt', Date.now());
  
  // Store the exported Lexical node data
  if (lexicalNode) {
    try {
      const exportedNode = lexicalNode.exportJSON();
      treeNode.data.set('node', JSON.stringify(exportedNode));
    } catch (error) {
      console.warn('Failed to export Text node JSON:', error);
      treeNode.data.set('node', JSON.stringify({ 
        type: 'text', 
        key: nodeKey, 
        text: textContent, 
        format: format || 0 
      }));
    }
  }
  
  return treeId;
}

/**
 * Update TextNode in Loro tree
 */
export function updateTextNodeInLoro(
  nodeKey: string,
  newTextContent?: string,
  format?: number,
  mode?: string,
  lexicalNode?: any, // The actual Lexical TextNode instance
  options?: TextNodeMutatorOptions
): void {
  const { tree, peerId } = options!;
  const treeId: TreeID = `${Number(nodeKey)}@${peerId}`;
  const treeNode = tree.getNodeByID(treeId);
  
  if (!treeNode) {
    console.warn(`TextNode with ID ${treeId} not found in tree`);
    return;
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
  
  // Update the exported Lexical node data
  if (lexicalNode) {
    try {
      const exportedNode = lexicalNode.exportJSON();
      treeNode.data.set('node', JSON.stringify(exportedNode));
    } catch (error) {
      console.warn('Failed to export Text node JSON during update:', error);
      treeNode.data.set('node', JSON.stringify({ 
        type: 'text', 
        key: nodeKey, 
        text: newTextContent, 
        format: format 
      }));
    }
  }
}

/**
 * Delete TextNode from Loro tree
 */
export function deleteTextNodeInLoro(
  nodeKey: string,
  options: TextNodeMutatorOptions
): void {
  const { tree, peerId } = options;
  const treeId: TreeID = `${Number(nodeKey)}@${peerId}`;
  
  if (tree.has(treeId)) {
    tree.delete(treeId);
  }
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
  if (!treeNode || treeNode.data.get('nodeType') !== 'text') {
    return null;
  }
  
  const textContent = treeNode.data.get('textContent');
  const safeTextContent = typeof textContent === 'string' ? textContent : '';
  const textNode = $createTextNode(safeTextContent);
  
  // Apply formatting if present
  const format = treeNode.data.get('format');
  if (format && typeof format === 'number') {
    textNode.setFormat(format as unknown as TextFormatType);
  }
  
  // Apply mode if present (skip for now as it requires specific mode types)
  // const mode = treeNode.data.get('mode');
  // if (mode && typeof textNode.setMode === 'function') {
  //   textNode.setMode(mode);
  // }
  
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
  nodeKey: string,
  formatType: TextFormatType,
  apply: boolean,
  options: TextNodeMutatorOptions
): void {
  const { tree, peerId } = options;
  const treeId: TreeID = `${Number(nodeKey)}@${peerId}`;
  
  if (!tree.has(treeId)) {
    return;
  }
  
  const treeNode = tree.getNodeByID(treeId);
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
  update: any, // UpdateListenerPayload
  mutation: 'created' | 'updated' | 'destroyed',
  nodeKey: string,
  options: TextNodeMutatorOptions
): void {
  const { tree, peerId } = options;

  switch (mutation) {
    case 'created': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isTextNode(currentNode)) {
        // Get parent and index for proper positioning
        const parent = currentNode.getParent();
        const parentId = parent ? `${Number(parent.getKey())}@${peerId}` as TreeID : undefined;
        const index = currentNode.getIndexWithinParent();
        
        // Get text content and formatting
        const textContent = currentNode.getTextContent();
        const format = currentNode.getFormat();
        const mode = currentNode.getMode();
        
        createTextNodeInLoro(nodeKey, textContent, format, mode, parentId, index, currentNode, options);
      }
      break;
    }

    case 'updated': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isTextNode(currentNode)) {
        // Get updated text content and formatting
        const textContent = currentNode.getTextContent();
        const format = currentNode.getFormat();
        const mode = currentNode.getMode();
        
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