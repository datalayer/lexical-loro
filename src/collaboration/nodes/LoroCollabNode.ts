/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LexicalNode, NodeKey, NodeMap } from 'lexical';

/**
 * Base interface for all Loro collaboration nodes.
 * Similar to YJS CollabNode but adapted for Loro.
 */
export interface LoroCollabNode {
  _key: NodeKey;
  _type: string;
  _parent: any | null; // Use any to avoid circular dependency

  /**
   * Get the Lexical node associated with this collaboration node
   */
  getNode(): LexicalNode | null;

  /**
   * Get the previous version of the Lexical node from a specific node map
   */
  getPrevNode(nodeMap: NodeMap | null): LexicalNode | null;

  /**
   * Get the type of this collaboration node
   */
  getType(): string;

  /**
   * Get the NodeKey for this collaboration node
   */
  getKey(): NodeKey;

  /**
   * Get the size (number of characters/elements) of this node
   */
  getSize(): number;

  /**
   * Get the offset of this node within its parent
   */
  getOffset(): number;
}
