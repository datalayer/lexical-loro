import { TreeID, LoroTree } from 'loro-crdt';
import { LexicalNode, NodeKey } from 'lexical';
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
  
  // First try nodeData passed from TreeDiff integrater (has immediate lexical data)
  let lexicalData = nodeDataFromDiff?.lexical;
  
  // Fallback to tree node data
  if (!lexicalData) {
    lexicalData = treeNode?.data.get('lexical');
  }

  // DIAGNOSTIC LOGGING - Remove after fix confirmed
  console.log('🏭 NodeFactory: TreeID data inspection', {
    treeId,
    source: {
      hasNodeDataFromDiff: !!nodeDataFromDiff,
      hasTreeNodeData: !!treeNode?.data,
      hasLexicalData: !!lexicalData,
    },
    lexicalData: {
      type: lexicalData?.type,
      __type: lexicalData?.__type,
      allKeys: lexicalData ? Object.keys(lexicalData) : [],
    },
    fallbacks: {
      nodeDataElementType: nodeDataFromDiff?.elementType,
      treeNodeElementType: treeNode?.data.get('elementType'),
      treeNodeType: treeNode?.data.get('nodeType'),
    },
  });

  let nodeType: string;
  let deserializedData: any = null;
  
  if (lexicalData && typeof lexicalData === 'object') {
    // JSON object format - the only supported format
    nodeType = lexicalData.type || lexicalData.__type;
    deserializedData = { lexicalNode: lexicalData };
  } else {
    // Fallback to element type from nodeDataFromDiff or old nodeType
    const fallbackType = nodeDataFromDiff?.elementType || treeNode?.data.get('nodeType');
    if (!fallbackType || typeof fallbackType !== 'string') {
      console.warn('No lexical data or nodeType found for TreeID:', treeId);
      return null;
    }
    nodeType = fallbackType;
  }

  // DIAGNOSTIC LOGGING - Remove after fix confirmed
  console.log('🏭 NodeFactory: Node type resolution', {
    treeId,
    finalNodeType: nodeType,
    hasDeserializedData: !!deserializedData,
  });

  // Get the registered node class from the editor (following YJS pattern)
  const registeredNodes = binding.editor._nodes;

  const nodeInfo = registeredNodes.get(nodeType);

  console.log('🏭 NodeFactory: Node registration check', {
    treeId,
    nodeType,
    nodeRegistered: !!nodeInfo,
    nodeClassName: nodeInfo?.klass?.name,
    hasImportJSON: typeof nodeInfo?.klass?.importJSON === 'function',
  });

  if (!nodeInfo) {
    console.error('🏭 NodeFactory: FAILED - Node not registered', {
      treeId,
      attemptedType: nodeType,
      registeredTypes: Array.from(binding.editor._nodes.keys()),
    });
    return null;
  }

  // Create new instance of the registered node class
  let lexicalNode: LexicalNode;

  // PHASE 1: Try using importJSON if available (handles property setters properly)
  // This is the most robust approach as it uses Lexical's own deserialization
  if (deserializedData?.lexicalNode && typeof nodeInfo.klass.importJSON === 'function') {
    try {
      console.log(`🏭 NodeFactory: Using importJSON for ${nodeType}`);
      lexicalNode = nodeInfo.klass.importJSON(deserializedData.lexicalNode);
      console.log(`🏭 NodeFactory: importJSON SUCCESS for ${nodeType}`, lexicalNode);
    } catch (error) {
      console.warn(`🏭 NodeFactory: importJSON FAILED for ${nodeType}:`, error);
      // Will fall through to constructor approach below
    }
  }

  // PHASE 2: Fallback to constructor approach if importJSON not available or failed
  if (!lexicalNode) {
    // Special handling for HeadingNode which requires tag parameter in constructor
    if (nodeType === 'heading') {
      const tag = (deserializedData?.lexicalNode?.tag ||
                   (lexicalData && typeof lexicalData === 'object' && lexicalData.tag) ||
                   'h1');

      try {
        // HeadingNode constructor signature: new HeadingNode(tag, key)
        // We pass tag as first argument, let Lexical generate the key
        lexicalNode = new nodeInfo.klass(tag);
      } catch (error) {
        console.warn(`🏭 NodeFactory: Failed to create HeadingNode:`, error);
        return null;
      }
    } else {
      try {
        lexicalNode = new nodeInfo.klass();
      } catch (error) {
        console.warn(`🏭 NodeFactory: Failed to create ${nodeType} instance:`, error);
        return null;
      }
    }

    // Note: DO NOT set __parent manually - let Lexical integrate parent-child relationships
    // through proper $ methods like append(), insertBefore(), etc.

    // Apply properties from the deserialized data if available
    // (Only when using constructor, not importJSON which handles this)
    if (deserializedData?.lexicalNode) {
      const nodeData = deserializedData.lexicalNode;

      // Apply all properties except system ones and tag (for HeadingNode)
      Object.keys(nodeData).forEach(key => {
        if (key !== '__parent' && key !== '__key' && key !== 'type') {
          try {
            if (key === 'tag' && nodeType === 'heading') {
              // Tag is already set in HeadingNode constructor, skip
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

      applicableKeys.forEach(key => {
        try {
          if (key === 'tag' && nodeType === 'heading') {
            // Tag is already set in HeadingNode constructor, skip
          } else {
            (lexicalNode as any)[key] = lexicalData[key];
          }
        } catch (error) {
          console.warn(`Failed to set property ${key} on node:`, error);
        }
      });
    }
  }

  return lexicalNode;
}