/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { TreeID, LoroTree } from 'loro-crdt';
import { LexicalNode, NodeKey } from 'lexical';
import { Binding } from '../Bindings';
import { invariant } from '../utils/Invariant';

/**
 * Resolve lexical data from Loro, handling Loro container objects.
 * When a JS object is stored in a LoroMap, Loro may return a LoroMap
 * container internally. This helper ensures we always get a plain JS object.
 */
function resolveLexicalData(raw: any): any {
  if (raw && typeof raw === 'object' && typeof raw.toJSON === 'function') {
    return raw.toJSON();
  }
  return raw;
}

/**
 * Factory function to create Lexical nodes from Loro TreeID.
 *
 * Uses the registered node's static `importJSON()` method, which is the
 * canonical Lexical API for restoring nodes from serialized data. This works
 * generically for ALL node types — built-in (paragraph, heading, table,
 * list, quote, code…), decorator (excalidraw, image, counter…), and any
 * externally-defined custom nodes (e.g. JupyterCellNode) as long as they
 * are registered with the editor and implement the standard `importJSON`
 * static method required by Lexical's serialization contract.
 */
export function createLexicalNodeFromLoro(
  treeId: TreeID, 
  loroTree: LoroTree,
  binding: Binding,
  parentKey?: NodeKey,
  nodeDataFromDiff?: any
): LexicalNode | null {
  // Get node data from Loro tree. A create op for a tree node that does not
  // exist is a real inconsistency.
  invariant(loroTree.has(treeId), 'NodeFactory: TreeID not present in Loro tree', { treeId });

  const treeNode = loroTree.getNodeByID(treeId);
  
  // First try nodeData passed from TreeDiff integrator (has immediate lexical data)
  let lexicalData = resolveLexicalData(nodeDataFromDiff?.lexical);
  
  // Fallback to tree node data
  if (!lexicalData) {
    lexicalData = resolveLexicalData(treeNode?.data.get('lexical'));
  }
  
  if (!lexicalData || typeof lexicalData !== 'object') {
    // Last resort: reconstruct a minimal serialization from elementType metadata.
    const fallbackType =
      nodeDataFromDiff?.elementType ||
      treeNode?.data.get('elementType') ||
      treeNode?.data.get('nodeType');
    invariant(
      typeof fallbackType === 'string' && fallbackType.length > 0,
      'NodeFactory: no lexical data or elementType for TreeID',
      { treeId },
    );
    lexicalData = { type: fallbackType, version: 1 };
  }

  const nodeType: string = lexicalData.type || lexicalData.__type;
  invariant(!!nodeType, 'NodeFactory: no type field in lexical data for TreeID', { treeId });

  // Get the registered node class from the editor.
  const registeredNodes = binding.editor._nodes;
  const nodeInfo = registeredNodes.get(nodeType);
  invariant(
    nodeInfo != null,
    'NodeFactory: node type is not registered in the editor',
    { treeId, nodeType },
  );

  // ---------- Generic creation via importJSON ----------
  // Every Lexical node class must implement the static `importJSON` method.
  // Using it guarantees that:
  //   • Constructor parameters are handled correctly (heading tag, excalidraw
  //     data, JupyterCellNode code/outputs, …)
  //   • Node state (Lexical 0.35+ `createState` / `$config`) is restored
  //   • Base properties (format, indent, direction, style, mode, detail, …)
  //     are applied via the chained `updateFromJSON` call
  // This removes the need for any node-type-specific branching.
  const serializedData = { ...lexicalData };

  // Ensure required serialization fields.
  if (!serializedData.type) {
    serializedData.type = nodeType;
  }
  if (serializedData.version === undefined) {
    serializedData.version = 1;
  }
  // Provide an empty children array for element-type nodes whose children are
  // managed as separate Loro tree nodes (importJSON does not recurse into
  // children — that is handled by TreeIntegrator).
  if (!('children' in serializedData)) {
    serializedData.children = [];
  }

  // Every registered Lexical node implements importJSON. If it throws, the
  // serialized data is malformed — surface it instead of silently substituting
  // a blank node via a constructor fallback (which hides the real problem).
  return nodeInfo.klass.importJSON(serializedData);
}