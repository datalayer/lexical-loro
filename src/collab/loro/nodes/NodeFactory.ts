/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

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

  // Get the registered node class from the editor (following YJS pattern)
  const registeredNodes = binding.editor._nodes;
    
  const nodeInfo = registeredNodes.get(nodeType);
  
  if (!nodeInfo) {
    return null;
  }

  // Create new instance of the registered node class
  let lexicalNode: LexicalNode;
  
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
  if (deserializedData?.lexicalNode) {
    const nodeData = deserializedData.lexicalNode;
    
    // Apply all properties except system ones and tag (for HeadingNode)
    Object.keys(nodeData).forEach(key => {
      if (key !== '__parent' && key !== '__key') {
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

  return lexicalNode;
}