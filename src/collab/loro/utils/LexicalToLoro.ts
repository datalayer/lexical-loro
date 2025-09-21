import { TreeID, LoroTree, LoroTreeNode, LoroDoc } from 'loro-crdt';


/**
 * Utility to convert Lexical JSON structure to Loro tree
 */

interface LexicalNodeJSON {
  type: string;
  children?: LexicalNodeJSON[];
  [key: string]: any;
}

interface LexicalJSON {
  root: LexicalNodeJSON;
}

/**
 * Convert Lexical JSON to Loro tree structure
 * This is used to initialize a Loro tree from existing Lexical content
 */
export function lexicalToLoroTree(lexicalJson: string | LexicalJSON, tree: LoroTree, doc?: LoroDoc): TreeID {
  let parsedJson: LexicalJSON;
  
  if (typeof lexicalJson === 'string') {
    try {
      parsedJson = JSON.parse(lexicalJson);
    } catch (error) {
      throw new Error(`Failed to parse Lexical JSON: ${error}`);
    }
  } else {
    parsedJson = lexicalJson;
  }

  // Start with the root node - create it without a parent
  const rootTreeNode = tree.createNode();
  const rootTreeID = rootTreeNode.id;
  
  processLexicalNode(parsedJson.root, tree, rootTreeNode, doc);
  
  return rootTreeID;
}

/**
 * Recursively process a Lexical node and add it to the Loro tree
 */
function processLexicalNode(
  lexicalNode: LexicalNodeJSON,
  tree: LoroTree,
  treeNode: LoroTreeNode,
  doc?: LoroDoc
): void {

  // Store the lexical data in the tree node
  const nodeData = treeNode.data;
  if (nodeData) {
    // Store element type for quick access
    nodeData.set('elementType', lexicalNode.type);
    
    // Store lexical node data in separate map if doc is available
    if (doc) {
      const lexicalNodeData = createLexicalNodeFromJSON(lexicalNode);
      const lexicalNodeJSON = lexicalNodeData.lexicalNode.exportJSON();
      // Remove key if it exists to avoid duplication (TreeID serves as the key)
      let cleanedData;
      if ('__key' in lexicalNodeJSON) {
        const { __key, ...cleaned } = lexicalNodeJSON;
        cleanedData = cleaned;
      } else {
        cleanedData = lexicalNodeJSON;
      }
      
      // Store in separate map
      const lexicalMap = doc.getMap(`lexical-${treeNode.id}`);
      lexicalMap.set('data', cleanedData);
    } else {
      // Fallback to old method if no doc provided
      const lexicalNodeData = createLexicalNodeFromJSON(lexicalNode);
      const lexicalNodeJSON = lexicalNodeData.lexicalNode.exportJSON();
      if ('__key' in lexicalNodeJSON) {
        const { __key, ...cleanedData } = lexicalNodeJSON;
        nodeData.set('lexical', cleanedData);
      } else {
        nodeData.set('lexical', lexicalNodeJSON);
      }
    }
  }

  // Process children if they exist
  if (lexicalNode.children && Array.isArray(lexicalNode.children)) {
    lexicalNode.children.forEach((child, childIndex) => {
      // Create child node under current node
      const childTreeNode = tree.createNode(treeNode.id, childIndex);
      processLexicalNode(child, tree, childTreeNode, doc);
    });
  }
}

/**
 * Create a minimal Lexical node representation from JSON data
 * This doesn't create actual Lexical nodes, just the data structure needed for serialization
 */
function createLexicalNodeFromJSON(nodeJson: LexicalNodeJSON): { lexicalNode: any } {
  // Create a minimal node-like object with the essential properties
  const nodeData = {
    __key: generateNodeKey(), // Generate a temporary key
    __type: nodeJson.type,
    __parent: null, // Will be set during tree construction
    __text: nodeJson.text || undefined,
    __format: nodeJson.format || 0,
    __style: nodeJson.style || '',
    __mode: nodeJson.mode || undefined,
    __detail: nodeJson.detail || undefined,
    __indent: nodeJson.indent || 0,
    __direction: nodeJson.direction || null,
    __tag: nodeJson.tag || undefined,
    __textFormat: nodeJson.textFormat || undefined,
    __textStyle: nodeJson.textStyle || undefined,
    __version: nodeJson.version || 1
  };

  // Remove undefined properties
  Object.keys(nodeData).forEach(key => {
    if (nodeData[key] === undefined) {
      delete nodeData[key];
    }
  });

  // Return in the format expected by LexicalNodeDataHelper
  return {
    lexicalNode: {
      getType: () => nodeJson.type,
      exportJSON: () => nodeData,
      getKey: () => nodeData.__key
    }
  };
}

/**
 * Generate a simple node key for temporary use
 */
function generateNodeKey(): string {
  return Math.random().toString(36).substr(2, 9);
}