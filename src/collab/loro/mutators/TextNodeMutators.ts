import { TreeID, LoroTree } from 'loro-crdt';
import { 
  $createTextNode, 
  TextNode, 
  $isTextNode,
  TextFormatType,
  UpdateListenerPayload,
  NodeKey,
  ElementNode
} from 'lexical';
import { getNodeMapper } from '../nodes/NodesMapper';
import { LexicalNodeData, LexicalNodeDataHelper } from '../types/LexicalNodeData';
import { Binding } from '../Bindings';
import { $diffTextContentAndApplyDelta } from '../utils/Utils';

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
  binding: Binding;
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
  lexicalNodeJSON?: any, // JSON object from exportJSON()
  options?: TextNodeMutatorOptions
): TreeID {
  const mapper = getNodeMapper();
  
  // Debug logging for text node creation issues
  if (!parentId) {
    console.warn(`⚠️  Creating TextNode ${nodeKey} without parent in Loro tree`);
  }
  
  // Use mapper to get or create the tree node
  // Note: We can't pass lexicalNode directly due to context issues, but parentId should be sufficient
  const treeNode = mapper.getLoroNodeByLexicalKey(
    nodeKey,
    undefined, // don't pass lexicalNode to avoid context issues  
    parentId,
    index
  );
  
  // Store complete lexical node data as clean JSON if provided
  if (lexicalNodeJSON) {
    try {
      // Store complete lexical JSON without the key
      if ('key' in lexicalNodeJSON || '__key' in lexicalNodeJSON) {
        const { key, __key, ...cleanedData } = lexicalNodeJSON;
        treeNode.data.set('lexical', cleanedData);
      } else {
        treeNode.data.set('lexical', lexicalNodeJSON);
      }
    } catch (error) {
      console.warn('Failed to store lexical node JSON for TextNode:', error);
    }
  }
  
  // Store only essential metadata (elementType for debug panel)
  treeNode.data.set('elementType', 'text');
  treeNode.data.set('createdAt', Date.now());
  
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
  lexicalNodeJSON?: any, // JSON object from exportJSON()
  options?: TextNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Get the existing tree node using the mapper
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey, undefined);
  
  // Store complete lexical node data as clean JSON if provided
  if (lexicalNodeJSON) {
    try {
      // Store complete lexical JSON without the key
      if ('key' in lexicalNodeJSON || '__key' in lexicalNodeJSON) {
        const { key, __key, ...cleanedData } = lexicalNodeJSON;
        treeNode.data.set('lexical', cleanedData);
      } else {
        treeNode.data.set('lexical', lexicalNodeJSON);
      }
    } catch (error) {
      console.warn('Failed to store lexical node JSON for TextNode update:', error);
    }
  }
  
  // Update only essential metadata
  treeNode.data.set('elementType', 'text');
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
  parentNode: ElementNode,
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
  
  // Get LexicalNodeData (JSON object format only)
  const lexicalData = treeNode.data.get('lexical');
  let textNode: TextNode;
  
  if (lexicalData && typeof lexicalData === 'object') {
    try {
      // lexicalData is a direct JSON object, use it to create a TextNode
      const lexicalDataObj = lexicalData as any;
      const textContent = lexicalDataObj.text || lexicalDataObj.__text || '';
      const format = lexicalDataObj.format || lexicalDataObj.__format || 0;
      const mode = lexicalDataObj.mode || lexicalDataObj.__mode || 0;
      
      textNode = $createTextNode(textContent);
      textNode.setFormat(format);
      textNode.setMode(mode);
      
    } catch (error) {
      console.warn('Failed to create TextNode from JSON data for TreeID:', treeId, error);
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
  textNode: TextNode,
  newParentNode?: ElementNode,
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
      textNode.getTextContent() !== textContent) {
    const currentText = textNode.getTextContent();
    $diffTextContentAndApplyDelta(textNode, textNode.getKey(), currentText, textContent);
  }
  
  // Update format if it has changed
  const format = treeNode.data.get('format');
  if (format !== undefined && typeof format === 'number') {
    textNode.setFormat(format as unknown as TextFormatType);
  }
  
  // Update mode if it has changed (skip for now due to type complexity)
  // const mode = treeNode.data.get('mode');
  // if (mode !== undefined && typeof lexicalNode.setMode === 'function') {
  //   lexicalNode.setMode(mode);
  // }
  
  // If parent or position changed, move the node
  if (newParentNode && newIndex !== undefined) {
    // Remove from current location
    textNode.remove();
    
    // Insert at new location
    newParentNode.splice(newIndex, 0, [textNode]);
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

  console.log(`📝 TextNode mutation: ${mutation} for key: ${nodeKey}`);
  
  switch (mutation) {
    case 'created': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      
      // Check if this node already exists in Loro (indicates initialization/restoration)
      const mapper = getNodeMapper();
      const existingTreeId = mapper.getTreeIdByLexicalKey(nodeKey);
      if (existingTreeId) {
        console.log(`📝 TextNode ${nodeKey} already exists in Loro as ${existingTreeId} - skipping creation (likely initialization)`);
        return; // Skip creation since this is restoration from existing Loro state
      }
      
      if (currentNode && $isTextNode(currentNode)) {
        // Get parent, positioning, content, and serialized data using editor state context
        const { parent, parentId, index, textContent, format, mode, lexicalNodeJSON } = update.editorState.read(() => {
          const parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          const parentId = parent ? mapper.getTreeIdByLexicalKey(parent.getKey()) : undefined;
          
          // Debug logging for parent-child relationships
          if (!parentId && parent) {
            console.warn(`⚠️  TextNode ${nodeKey}: Parent ${parent.getKey()} (${parent.getType()}) not found in Loro tree`);
          }
          const index = currentNode.getIndexWithinParent();
          const textContent = currentNode.getTextContent();
          const format = currentNode.getFormat();
          const mode = currentNode.getMode();
          
          // Export node data as JSON object within editor context where node methods are available
          let lexicalNodeJSON: any = undefined;
          try {
            lexicalNodeJSON = currentNode.exportJSON();
          } catch (error) {
            console.warn('Failed to export node JSON in mutateTextNode created:', error);
          }
          
          return { parent, parentId, index, textContent, format, mode, lexicalNodeJSON };
        });
        
        createTextNodeInLoro(nodeKey, textContent, format, mode, parentId, index, lexicalNodeJSON, options);
      }
      break;
    }

    case 'updated': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isTextNode(currentNode)) {
        // Get updated text content, formatting, and JSON data using editor state context
        const { textContent, format, mode, lexicalNodeJSON } = update.editorState.read(() => {
          const textContent = currentNode.getTextContent();
          const format = currentNode.getFormat();
          const mode = currentNode.getMode();
          
          // Export node data as JSON object within editor context where node methods are available
          let lexicalNodeJSON: any = undefined;
          try {
            lexicalNodeJSON = currentNode.exportJSON();
          } catch (error) {
            console.warn('Failed to export node JSON in mutateTextNode updated:', error);
          }
          
          return { textContent, format, mode, lexicalNodeJSON };
        });
        
        updateTextNodeInLoro(nodeKey, textContent, format, mode, lexicalNodeJSON, options);
      }
      break;
    }

    case 'destroyed': {
      deleteTextNodeInLoro(nodeKey, options);
      break;
    }
  }
}