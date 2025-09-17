import type {DecoratorNode, NodeKey, NodeMap} from 'lexical';
import {$getNodeByKey, $isDecoratorNode} from 'lexical';
import type {LoroMap} from 'loro-crdt';
import invariant from '../../utils/invariant';
import {$syncPropertiesFromCRDT, syncPropertiesFromLexical} from '../utils/Utils';
import type {Binding} from '../Bindings';
import type {CollabElementNode} from './CollabElementNode';

export class CollabDecoratorNode {
  _xmlElem: LoroMap<Record<string, unknown>>;
  _key: NodeKey;
  _parent: CollabElementNode;
  _type: string;

  constructor(xmlElem: LoroMap<Record<string, unknown>>, parent: CollabElementNode, type: string) {
    console.log('DLA CollabDecoratorNode.constructor', {xmlElem, parent, type});
    this._key = '';
    this._xmlElem = xmlElem;
    this._parent = parent;
    this._type = type;
  }

  getPrevNode(nodeMap: null | NodeMap): null | DecoratorNode<unknown> {
    if (nodeMap === null) {
      return null;
    }

    const node = nodeMap.get(this._key);
    return $isDecoratorNode(node) ? node : null;
  }

  getNode(): null | DecoratorNode<unknown> {
    const node = $getNodeByKey(this._key);
    return $isDecoratorNode(node) ? node : null;
  }

  getSharedType(): LoroMap<Record<string, unknown>> {
    return this._xmlElem;
  }

  getType(): string {
    return this._type;
  }

  getKey(): NodeKey {
    return this._key;
  }

  getSize(): number {
    return 1;
  }

  getOffset(): number {
    const collabElementNode = this._parent;
    return collabElementNode.getChildOffset(this);
  }

  syncPropertiesFromLexical(
    binding: Binding,
    nextLexicalNode: DecoratorNode<unknown>,
    prevNodeMap: null | NodeMap,
  ): void {
    const prevLexicalNode = this.getPrevNode(prevNodeMap);
    const xmlElem = this._xmlElem;

    syncPropertiesFromLexical(
      binding,
      xmlElem,
      prevLexicalNode,
      nextLexicalNode,
    );
  }

  syncPropertiesFromCRDT(
    binding: Binding,
    keysChanged: null | Set<string>,
  ): void {
    const lexicalNode = this.getNode();
    invariant(
      lexicalNode !== null,
      'syncPropertiesFromCRDT: could not find decorator node',
    );
    const map = this._xmlElem;
    $syncPropertiesFromCRDT(binding, map, lexicalNode, keysChanged);
  }

  destroy(binding: Binding): void {
    const collabNodeMap = binding.collabNodeMap;
    if (collabNodeMap.get(this._key) === this) {
      collabNodeMap.delete(this._key);
    }
  }
}

export function $createCollabDecoratorNode(
  map: LoroMap<Record<string, unknown>>,
  parent: CollabElementNode,
  type: string,
): CollabDecoratorNode {
  const collabNode = new CollabDecoratorNode(map, parent, type);
  
  // Set the __type property in the LoroMap so getNodeTypeFromSharedType can find it
  map.set('__type', type);
  
  (map as any)._collabNode = collabNode;
  return collabNode;
}
