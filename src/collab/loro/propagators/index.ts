/**
 * Lexical Node Propagator for Loro Tree Collaboration
 * 
 * This module exports mutator functions for all Lexical node types
 * to enable bidirectional synchronization with Loro Tree Loro.
 */

import { ElementNode, NodeKey } from 'lexical';
import { Binding } from '../Bindings';
import { LoroTree } from 'loro-crdt/bundler/loro_wasm';

// Root Node Propagator
export * from './RootNodePropagator';

// Line Break Node Propagator  
export * from './LineBreakNodePropagator';

// Element Node Propagator
export * from './ElementNodePropagator';

// Text Node Propagator
export * from './TextNodePropagator';

// Decorator Node Propagator
export * from './DecoratorNodePropagator';

// Main mutator functions for delegation
export { mutateRootNode } from './RootNodePropagator';
export { mutateLineBreakNode } from './LineBreakNodePropagator';
export { mutateElementNode } from './ElementNodePropagator';
export { mutateTextNode } from './TextNodePropagator';
export { mutateDecoratorNode } from './DecoratorNodePropagator';

/**
 * Type definitions for mutator options
 */
export interface BaseMutatorOptions {
  binding: Binding;
  tree: LoroTree;
  peerId: number;
}

/**
 * Unified mutator interface for all node types
 */
export interface NodeMutator<T = any> {
  create: (nodeKey: NodeKey, ...args: any[]) => string; // TreeID
  update: (nodeKey: NodeKey, ...args: any[]) => void;
  delete: (nodeKey: NodeKey, options: BaseMutatorOptions) => void;
  createFromLoro: (treeId: string, parentNode: ElementNode, index?: number, options?: BaseMutatorOptions) => T | null;
  updateFromLoro: (treeId: string, lexicalNode: T, newParentNode?: ElementNode, newIndex?: number, options?: BaseMutatorOptions) => void;
  deleteFromLoro: (treeId: string, lexicalNode: T, options?: BaseMutatorOptions) => void;
}

/**
 * Node type constants for identifying different Lexical node types in Loro tree
 */
export const NODE_TYPES = {
  ROOT: 'root',
  ELEMENT: 'element',
  TEXT: 'text',
  LINEBREAK: 'linebreak',
  DECORATOR: 'decorator',
} as const;

export type NodeType = typeof NODE_TYPES[keyof typeof NODE_TYPES];
