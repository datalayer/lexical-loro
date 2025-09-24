import { CollabDecoratorNode } from "./CollabDecoratorNode";
import { CollabElementNode } from "./CollabElementNode";
import { CollabLineBreakNode } from "./CollabLineBreakNode";
import { CollabTextNode } from "./CollabTextNode";

export type AnyCollabNode =
  | CollabDecoratorNode
  | CollabElementNode
  | CollabTextNode
  | CollabLineBreakNode;

