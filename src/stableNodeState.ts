/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { createState } from 'lexical';

/**
 * NodeState configuration for storing stable UUIDs in Lexical nodes.
 * This replaces the unstable NodeKey system for cursor positioning.
 * 
 * Based on Lexical NodeState documentation:
 * https://lexical.dev/docs/concepts/node-state
 */
export const stableNodeIdState = createState('stable-node-id', {
  parse: (v: unknown) => typeof v === 'string' ? v : undefined,
});
