/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { CollabDecoratorNode } from "./CollabDecoratorNode";
import { CollabElementNode } from "./CollabElementNode";
import { CollabLineBreakNode } from "./CollabLineBreakNode";
import { CollabTextNode } from "./CollabTextNode";

export type AnyCollabNode =
  | CollabDecoratorNode
  | CollabElementNode
  | CollabTextNode
  | CollabLineBreakNode;

