/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { createState } from 'lexical';

// Shared NodeState for the counter value
export const counterValueState = createState('counter-value', {
  parse: (v: unknown) => (typeof v === 'number' ? v : undefined),
});
