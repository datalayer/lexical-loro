import { TreeID, LoroTree } from 'loro-crdt';
import { LexicalNode, NodeKey } from 'lexical';
import { Binding } from '../Bindings';

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
  // Get node data from Loro tree
  if (!loroTree.has(treeId)) {
    return null;
  }

  const treeNode = loroTree.getNodeByID(treeId);
  
  // First try nodeData passed from TreeDiff integrator (has immediate lexical data)
  let lexicalData = resolveLexicalData(nodeDataFromDiff?.lexical);
  
  // Fallback to tree node data
  if (!lexicalData) {
    lexicalData = resolveLexicalData(treeNode?.data.get('lexical'));
  }
  
  if (!lexicalData || typeof lexicalData !== 'object') {
    // Last resort: construct a minimal serialization from elementType metadata
    const fallbackType =
      nodeDataFromDiff?.elementType ||
      treeNode?.data.get('elementType') ||
      treeNode?.data.get('nodeType');
    if (!fallbackType || typeof fallbackType !== 'string') {
      console.warn('🏭 NodeFactory: No lexical data or elementType for TreeID:', treeId);
      return null;
    }
    lexicalData = { type: fallbackType, version: 1 };
  }

  const nodeType: string = lexicalData.type || lexicalData.__type;
  if (!nodeType) {
    console.warn('🏭 NodeFactory: No type field in lexical data for TreeID:', treeId);
    return null;
  }

  // Get the registered node class from the editor
  const registeredNodes = binding.editor._nodes;
  const nodeInfo = registeredNodes.get(nodeType);
  
  if (!nodeInfo) {
    console.warn(`🏭 NodeFactory: Node type '${nodeType}' is not registered in the editor`);
    return null;
  }

  // ---------- Generic creation via importJSON ----------
  // Every Lexical node class must implement the static `importJSON` method.
  // Using it guarantees that:
  //   • Constructor parameters are handled correctly (heading tag, excalidraw
  //     data, JupyterCellNode code/outputs, …)
  //   • Node state (Lexical 0.35+ `createState` / `$config`) is restored
  //   • Base properties (format, indent, direction, style, mode, detail, …)
  //     are applied via the chained `updateFromJSON` call
  // This removes the need for any node-type-specific branching.
  try {
    const serializedData = { ...lexicalData };

    // Ensure required serialization fields
    if (!serializedData.type) {
      serializedData.type = nodeType;
    }
    if (serializedData.version === undefined) {
      serializedData.version = 1;
    }
    // Provide an empty children array for element-type nodes whose children
    // are managed as separate Loro tree nodes (importJSON itself does not
    // recurse into children — that is handled by TreeIntegrator).
    if (!('children' in serializedData)) {
      serializedData.children = [];
    }

    const lexicalNode: LexicalNode = nodeInfo.klass.importJSON(serializedData);
    return lexicalNode;
  } catch (importError) {
    console.warn(`🏭 NodeFactory: importJSON failed for '${nodeType}', trying constructor fallback:`, importError);

    // Fallback: try no-arg constructor (works for simple nodes)
    try {
      const lexicalNode: LexicalNode = new nodeInfo.klass();
      return lexicalNode;
    } catch (ctorError) {
      console.warn(`🏭 NodeFactory: Constructor also failed for '${nodeType}':`, ctorError);
      return null;
    }
  }
}