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
  console.log(`🏭 NodeFactory: Processing TreeID ${treeId}, type will be: ${typeof lexicalData === 'object' && lexicalData ? lexicalData.type || lexicalData.__type : 'no-lexical-data'}`);
  
  if (lexicalData && typeof lexicalData === 'object') {
    // JSON object format - the only supported format
    nodeType = lexicalData.type || lexicalData.__type;
    deserializedData = { lexicalNode: lexicalData };
    console.log(`🏭 NodeFactory: Using lexical JSON object for TreeID ${treeId}:`, nodeType, lexicalData);
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
  let lexicalNode: LexicalNode;
  
  // Special handling for HeadingNode which requires tag parameter in constructor
  if (nodeType === 'heading') {
    const tag = (deserializedData?.lexicalNode?.tag || 
                 (lexicalData && typeof lexicalData === 'object' && lexicalData.tag) || 
                 'h1');
    console.log(`🏭 NodeFactory: Creating HeadingNode with tag: ${tag}`);
    
    try {
      // HeadingNode constructor signature: new HeadingNode(tag, key)
      // We pass tag as first argument, let Lexical generate the key
      lexicalNode = new nodeInfo.klass(tag);
      console.log(`🏭 NodeFactory: Created HeadingNode using constructor with tag: ${tag}`);
    } catch (error) {
      console.error(`🏭 NodeFactory: Failed to create HeadingNode:`, error);
      return null;
    }
  } else {
    try {
      lexicalNode = new nodeInfo.klass();
      console.log(`🏭 NodeFactory: Created ${nodeType} instance successfully`);
    } catch (error) {
      console.error(`🏭 NodeFactory: Failed to create ${nodeType} instance:`, error);
      return null;
    }
  }
  
  // Note: DO NOT set __parent manually - let Lexical handle parent-child relationships
  // through proper $ methods like append(), insertBefore(), etc.

  // Apply properties from the deserialized data if available
  if (deserializedData?.lexicalNode) {
    const nodeData = deserializedData.lexicalNode;
    
    console.log(`🏭 NodeFactory: Applying ${Object.keys(nodeData).length} properties from deserializedData.lexicalNode`);
    
    // Apply all properties except system ones and tag (for HeadingNode)
    Object.keys(nodeData).forEach(key => {
      if (key !== '__parent' && key !== '__key') {
        try {
          if (key === 'tag' && nodeType === 'heading') {
            // Tag is already set in HeadingNode constructor, skip
            console.log(`🏭 NodeFactory: Skipping tag property (already set in constructor): ${nodeData[key]}`);
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
          // Tag is already set in HeadingNode constructor, skip
          console.log(`🏭 NodeFactory: Skipping tag property (already set in constructor): ${lexicalData[key]}`);
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