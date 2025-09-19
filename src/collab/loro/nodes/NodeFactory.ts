import { TreeID, LoroTree } from 'loro-crdt';
import { LexicalNode, NodeKey } from 'lexical';
import { LexicalNodeData, LexicalNodeDataHelper } from '../types/LexicalNodeData';
import { Binding } from '../Bindings';

/**
 * Factory function to create Lexical nodes from Loro TreeID
 * Uses the editor's registered node classes, similar to YJS implementation
 */
export function createLexicalNodeFromLoro(
  treeId: TreeID, 
  loroTree: LoroTree,
  binding: Binding,
  parentKey?: NodeKey,
  nodeDataFromDiff?: any
): LexicalNode | null {
  // Get node data from Loro tree
  if (!loroTree.has(treeId)) {
    return null;
  }

  const treeNode = loroTree.getNodeByID(treeId);
  
  // First try nodeData passed from TreeDiff handler (has immediate lexical data)
  let lexicalData = nodeDataFromDiff?.lexical;
  
  // Fallback to tree node data
  if (!lexicalData) {
    lexicalData = treeNode?.data.get('lexical');
  }
  
  let nodeType: string;
  let deserializedData: any = null;
  
  if (lexicalData && typeof lexicalData === 'string') {
    // New format: deserialize LexicalNodeData to get the nodeType and properties
    try {
      deserializedData = LexicalNodeDataHelper.deserialize(lexicalData);
      // The deserialized data is a plain JSON object, access __type directly
      nodeType = deserializedData.lexicalNode.__type;
    } catch (error) {
      console.warn('Failed to deserialize LexicalNodeData for TreeID:', treeId, error);
      return null;
    }
  } else if (lexicalData && typeof lexicalData === 'object') {
    // Direct object format (from TreeDiff handler or MapDiff)
    nodeType = lexicalData.type || lexicalData.__type;
    deserializedData = { lexicalNode: lexicalData };
    console.log(`Using direct lexical object for TreeID ${treeId}:`, nodeType);
  } else {
    // Fallback to element type from nodeDataFromDiff or old nodeType
    const fallbackType = nodeDataFromDiff?.elementType || treeNode?.data.get('nodeType');
    if (!fallbackType || typeof fallbackType !== 'string') {
      console.warn('No lexical data or nodeType found for TreeID:', treeId);
      return null;
    }
    nodeType = fallbackType;
    console.log(`Using fallback nodeType for TreeID ${treeId}:`, nodeType);
  }

  // Get the registered node class from the editor (following YJS pattern)
  const registeredNodes = binding.editor._nodes;
  const nodeInfo = registeredNodes.get(nodeType);
  
  if (!nodeInfo) {
    console.warn('Node type not registered:', nodeType);
    return null;
  }

  // Create new instance of the registered node class
  const lexicalNode: LexicalNode = new nodeInfo.klass();
  
  // Note: DO NOT set __parent manually - let Lexical handle parent-child relationships
  // through proper $ methods like append(), insertBefore(), etc.

  // Apply properties from the deserialized data if available
  if (deserializedData?.lexicalNode) {
    const nodeData = deserializedData.lexicalNode;
    
    // Apply all properties except system ones
    Object.keys(nodeData).forEach(key => {
      if (key !== '__parent' && key !== '__key') {
        try {
          (lexicalNode as any)[key] = nodeData[key];
        } catch (error) {
          console.warn(`Failed to set property ${key} on node:`, error);
        }
      }
    });
  }

  console.log(`✅ Created Lexical node: ${nodeType} with key: ${lexicalNode.getKey()}`);
  return lexicalNode;
}