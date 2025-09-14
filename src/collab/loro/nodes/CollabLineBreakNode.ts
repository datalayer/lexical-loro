import type {LineBreakNode, NodeKey} from 'lexical';
import {$getNodeByKey, $isLineBreakNode} from 'lexical';
import type {LoroMap} from 'loro-crdt';
import type {Binding} from '../Bindings';
import type {CollabElementNode} from './CollabElementNode';

export class CollabLineBreakNode {
  _map: LoroMap<Record<string, unknown>>;
  _key: NodeKey;
  _parent: CollabElementNode;
  _type: 'linebreak';

  constructor(map: LoroMap<Record<string, unknown>>, parent: CollabElementNode) {
    this._key = '';
    this._map = map;
    this._parent = parent;
    this._type = 'linebreak';
  }

  getNode(): null | LineBreakNode {
    const node = $getNodeByKey(this._key);
    return $isLineBreakNode(node) ? node : null;
  }

  getKey(): NodeKey {
    return this._key;
  }

  getSharedType(): LoroMap<Record<string, unknown>> {
    return this._map;
  }

  getType(): string {
    return this._type;
  }

  getSize(): number {
    return 1;
  }

  getOffset(): number {
    const collabElementNode = this._parent;
    return collabElementNode.getChildOffset(this);
  }

  destroy(binding: Binding): void {
    const collabNodeMap = binding.collabNodeMap;
    if (collabNodeMap.get(this._key) === this) {
      collabNodeMap.delete(this._key);
    }
  }
}

export function $createCollabLineBreakNode(
  map: LoroMap<Record<string, unknown>>,
  parent: CollabElementNode,
): CollabLineBreakNode {
  const collabNode = new CollabLineBreakNode(map, parent);
  (map as any)._collabNode = collabNode;
  return collabNode;
}
