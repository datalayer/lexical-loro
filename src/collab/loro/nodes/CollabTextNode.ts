import type {NodeKey, NodeMap, TextNode} from 'lexical';
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
} from 'lexical';
import type {LoroMap} from 'loro-crdt';
import type {Binding} from '../Bindings';
import type {CollabElementNode} from './CollabElementNode';
import invariant from '../../utils/invariant';
import simpleDiffWithCursor from '../../utils/simpleDiffWithCursor';

import {$syncPropertiesFromCRDT, syncPropertiesFromLexical} from '../Utils';

function $diffTextContentAndApplyDelta(
  collabNode: CollabTextNode,
  key: NodeKey,
  prevText: string,
  nextText: string,
): void {
  const selection = $getSelection();
  let cursorOffset = nextText.length;

  if ($isRangeSelection(selection) && selection.isCollapsed()) {
    const anchor = selection.anchor;

    if (anchor.key === key) {
      cursorOffset = anchor.offset;
    }
  }

  const diff = simpleDiffWithCursor(prevText, nextText, cursorOffset);
  collabNode.spliceText(diff.index, diff.remove, diff.insert);
}

export class CollabTextNode {
  _map: LoroMap<Record<string, unknown>>;
  _key: NodeKey;
  _parent: CollabElementNode;
  _text: string;
  _type: string;
  _normalized: boolean;

  constructor(
    map: LoroMap<Record<string, unknown>>,
    text: string,
    parent: CollabElementNode,
    type: string,
  ) {
    this._key = '';
    this._map = map;
    this._parent = parent;
    this._text = text;
    this._type = type;
    this._normalized = false;
  }

  getPrevNode(nodeMap: null | NodeMap): null | TextNode {
    if (nodeMap === null) {
      return null;
    }

    const node = nodeMap.get(this._key);
    return $isTextNode(node) ? node : null;
  }

  getNode(): null | TextNode {
    const node = $getNodeByKey(this._key);
    return $isTextNode(node) ? node : null;
  }

  getSharedType(): LoroMap<Record<string, unknown>> {
    return this._map;
  }

  getType(): string {
    return this._type;
  }

  getKey(): NodeKey {
    return this._key;
  }

  getSize(): number {
    return this._text.length + (this._normalized ? 0 : 1);
  }

  getOffset(): number {
    const collabElementNode = this._parent;
    return collabElementNode.getChildOffset(this);
  }

  spliceText(index: number, delCount: number, newText: string): void {
    const collabElementNode = this._parent;
    const xmlText = collabElementNode._xmlText;
    const offset = this.getOffset() + index;

    if (delCount !== 0) {
      xmlText.delete(offset, delCount);
    }

    if (newText !== '') {
      xmlText.insert(offset, newText);
    }
  }

  syncPropertiesAndTextFromLexical(
    binding: Binding,
    nextLexicalNode: TextNode,
    prevNodeMap: null | NodeMap,
  ): void {
    const prevLexicalNode = this.getPrevNode(prevNodeMap);
    const nextText = nextLexicalNode.__text;

    syncPropertiesFromLexical(
      binding,
      this._map,
      prevLexicalNode,
      nextLexicalNode,
    );

    if (prevLexicalNode !== null) {
      const prevText = prevLexicalNode.__text;

      if (prevText !== nextText) {
        const key = nextLexicalNode.__key;
        $diffTextContentAndApplyDelta(this, key, prevText, nextText);
        this._text = nextText;
      }
    }
  }

  syncPropertiesAndTextFromCRDT(
    binding: Binding,
    keysChanged: null | Set<string>,
  ): void {
    const lexicalNode = this.getNode();
    invariant(
      lexicalNode !== null,
      'syncPropertiesAndTextFromCRDT: could not find decorator node',
    );

    $syncPropertiesFromCRDT(binding, this._map, lexicalNode, keysChanged);

    const collabText = this._text;
    const lexicalText = lexicalNode.__text;
    
    // Additional debugging - get parent XmlText content too
    const parentXmlText = this._parent._xmlText;
    const parentTextContent = parentXmlText ? parentXmlText.toPlainString() : '';
    
    if (lexicalText !== collabText) {
      lexicalNode.setTextContent(collabText);
    } else {
      // Even if text matches, let's force an update to ensure the editor reflects the content
      lexicalNode.setTextContent(collabText);
    }
  }

  destroy(binding: Binding): void {
    const collabNodeMap = binding.collabNodeMap;
    if (collabNodeMap.get(this._key) === this) {
      collabNodeMap.delete(this._key);
    }
  }
}

export function $createCollabTextNode(
  map: LoroMap<Record<string, unknown>>,
  text: string,
  parent: CollabElementNode,
  type: string,
): CollabTextNode {
  const collabNode = new CollabTextNode(map, text, parent, type);
  (map as any)._collabNode = collabNode;
  return collabNode;
}
