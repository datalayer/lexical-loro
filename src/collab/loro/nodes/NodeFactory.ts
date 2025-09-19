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
  
  // Debug: log what data we have
  console.log(`🏭 NodeFactory: Processing TreeID ${treeId}, type will be: ${typeof lexicalData === 'object' && lexicalData ? lexicalData.type || lexicalData.__type : 'from-string-data'}`);
  
  if (lexicalData && typeof lexicalData === 'string') {
    // New format: deserialize LexicalNodeData to get the nodeType and properties
    try {
      deserializedData = LexicalNodeDataHelper.deserialize(lexicalData);
      // The deserialized data is a plain JSON object, access __type directly
      nodeType = deserializedData.lexicalNode.__type;
      console.log(`🏭 NodeFactory: Deserialized nodeType: ${nodeType}`, deserializedData);
    } catch (error) {
      console.warn('Failed to deserialize LexicalNodeData for TreeID:', treeId, error);
      return null;
    }
  } else if (lexicalData && typeof lexicalData === 'object') {
    // Direct object format (from TreeDiff handler or MapDiff)
    nodeType = lexicalData.type || lexicalData.__type;
    deserializedData = { lexicalNode: lexicalData };
    console.log(`🏭 NodeFactory: Using direct lexical object for TreeID ${treeId}:`, nodeType, lexicalData);
  } else {
    // Fallback to element type from nodeDataFromDiff or old nodeType
    const fallbackType = nodeDataFromDiff?.elementType || treeNode?.data.get('nodeType');
    if (!fallbackType || typeof fallbackType !== 'string') {
      console.warn('No lexical data or nodeType found for TreeID:', treeId);
      return null;
    }
    nodeType = fallbackType;
    console.log(`🏭 NodeFactory: Using fallback nodeType for TreeID ${treeId}:`, nodeType);
  }

  // Get the registered node class from the editor (following YJS pattern)
  const registeredNodes = binding.editor._nodes;
  
  // Debug: log requested nodeType
  console.log(`🏭 NodeFactory: Looking for nodeType '${nodeType}'`);
  
  const nodeInfo = registeredNodes.get(nodeType);
  
  if (!nodeInfo) {
    console.warn('Node type not registered:', nodeType, 'Available types:', Array.from(registeredNodes.keys()));
    return null;
  }

  // Create new instance of the registered node class
  const lexicalNode: LexicalNode = new nodeInfo.klass();
  
  // Special handling for HeadingNode which requires tag parameter to be set after creation
  if (nodeType === 'heading') {
    const tag = (deserializedData?.lexicalNode?.tag || 
                 (lexicalData && typeof lexicalData === 'object' && lexicalData.tag) || 
                 'h1');
    console.log(`🏭 NodeFactory: Setting HeadingNode tag: ${tag}`);
    
    // Set the internal __tag property that HeadingNode uses
    (lexicalNode as any).__tag = tag;
  }
  
  // Note: DO NOT set __parent manually - let Lexical handle parent-child relationships
  // through proper $ methods like append(), insertBefore(), etc.

  // Apply properties from the deserialized data if available
  if (deserializedData?.lexicalNode) {
    const nodeData = deserializedData.lexicalNode;
    
    console.log(`🏭 NodeFactory: Applying ${Object.keys(nodeData).length} properties from deserializedData.lexicalNode`);
    
    // Apply all properties except system ones
    Object.keys(nodeData).forEach(key => {
      if (key !== '__parent' && key !== '__key') {
        try {
          if (key === 'tag' && nodeType === 'heading') {
            // Special handling for HeadingNode tag - use internal property name
            (lexicalNode as any).__tag = nodeData[key];
            console.log(`🏭 NodeFactory: Set HeadingNode __tag to: ${nodeData[key]}`);
          } else {
            (lexicalNode as any)[key] = nodeData[key];
          }
        } catch (error) {
          console.warn(`Failed to set property ${key} on node:`, error);
        }
      }
    });
  } else if (lexicalData && typeof lexicalData === 'object') {
    // For direct object format (like heading data), apply properties directly
    const applicableKeys = Object.keys(lexicalData).filter(key => 
      key !== '__parent' && key !== '__key' && key !== 'type' && key !== 'children'
    );
    console.log(`🏭 NodeFactory: Applying ${applicableKeys.length} properties from direct lexicalData:`, applicableKeys);
    
    applicableKeys.forEach(key => {
      try {
        if (key === 'tag' && nodeType === 'heading') {
          // Special handling for HeadingNode tag - use internal property name
          (lexicalNode as any).__tag = lexicalData[key];
          console.log(`🏭 NodeFactory: Set HeadingNode __tag to: ${lexicalData[key]}`);
        } else {
          (lexicalNode as any)[key] = lexicalData[key];
        }
      } catch (error) {
        console.warn(`Failed to set property ${key} on node:`, error);
      }
    });
  }

  // Final verification for HeadingNode
  if (nodeType === 'heading') {
    console.log(`✅ Created HeadingNode with key: ${lexicalNode.getKey()}, tag: ${(lexicalNode as any).__tag}, getTag(): ${(lexicalNode as any).getTag?.()}`);
  } else {
    console.log(`✅ Created Lexical node: ${nodeType} with key: ${lexicalNode.getKey()}`);
  }
  return lexicalNode;
}