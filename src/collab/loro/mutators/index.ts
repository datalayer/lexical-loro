/**
 * Lexical Node Mutators for Loro Tree Collaboration
 * 
 * This module exports mutator functions for all Lexical node types
 * to enable bidirectional synchronization with Loro Tree Loro.
 */

import { NodeKey } from 'lexical';

// Root Node Mutators
export * from './RootNodeMutators';

// Line Break Node Mutators  
export * from './LineBreakNodeMutators';

// Element Node Mutators
export * from './ElementNodeMutators';

// Text Node Mutators
export * from './TextNodeMutators';

// Decorator Node Mutators
export * from './DecoratorNodeMutators';

// Main mutator functions for delegation
export { mutateRootNode } from './RootNodeMutators';
export { mutateLineBreakNode } from './LineBreakNodeMutators';
export { mutateElementNode } from './ElementNodeMutators';
export { mutateTextNode } from './TextNodeMutators';
export { mutateDecoratorNode } from './DecoratorNodeMutators';

/**
 * Type definitions for mutator options
 */
export interface BaseMutatorOptions {
  binding: any;
  tree: any; // LoroTree
  peerId: number;
}

/**
 * Unified mutator interface for all node types
 */
export interface NodeMutator<T = any> {
  create: (nodeKey: NodeKey, ...args: any[]) => string; // TreeID
  update: (nodeKey: NodeKey, ...args: any[]) => void;
  delete: (nodeKey: NodeKey, options: BaseMutatorOptions) => void;
  createFromLoro: (treeId: string, parentNode: any, index?: number, options?: BaseMutatorOptions) => T | null;
  updateFromLoro: (treeId: string, lexicalNode: T, newParentNode?: any, newIndex?: number, options?: BaseMutatorOptions) => void;
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
