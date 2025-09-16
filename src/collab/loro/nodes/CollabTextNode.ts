import type {NodeKey, NodeMap, TextNode} from 'lexical';
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
} from 'lexical';
import type {LoroMap} from 'loro-crdt';
import invariant from '../../utils/invariant';
import simpleDiffWithCursor from '../../utils/simpleDiffWithCursor';
import {$syncPropertiesFromCRDT, syncPropertiesFromLexical} from '../utils/Utils';
import type {Binding} from '../Bindings';
import type {CollabElementNode} from './CollabElementNode';

function $diffTextContentAndApplyDelta(
  collabNode: CollabTextNode,
  key: NodeKey,
  prevText: string,
  nextText: string,
): void {
  console.log('🔍 [TEXT-DELTA] Computing text delta:', {
    nodeKey: key,
    prevText,
    nextText
  })
  
  const selection = $getSelection();
  let cursorOffset = nextText.length;

  if ($isRangeSelection(selection) && selection.isCollapsed()) {
    const anchor = selection.anchor;

    if (anchor.key === key) {
      cursorOffset = anchor.offset;
    }
  }

  const diff = simpleDiffWithCursor(prevText, nextText, cursorOffset);
  console.log('📐 [TEXT-DELTA] Computed diff:', {
    index: diff.index,
    remove: diff.remove,
    insert: diff.insert,
    insertLength: diff.insert?.length || 0
  })
  
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
    console.log('🔥 [SPLICE-TEXT] About to modify Loro CRDT:', {
      nodeKey: this._key,
      index,
      delCount,
      newText,
      newTextLength: newText.length
    })
    
    const collabElementNode = this._parent;
    const xmlText = collabElementNode._xmlText;
    const offset = this.getOffset() + 1 + index;

    console.log('📍 [SPLICE-TEXT] Computed offset:', {
      baseOffset: this.getOffset(),
      index,
      finalOffset: offset
    })

    if (delCount !== 0) {
      console.log('🗑️ [SPLICE-TEXT] Deleting from Loro CRDT:', { offset, delCount })
      xmlText.delete(offset, delCount);
    }

    if (newText !== '') {
      console.log('➕ [SPLICE-TEXT] Inserting into Loro CRDT:', { offset, newText })
      xmlText.insert(offset, newText);
      console.log('📊 [SPLICE-TEXT] Post-insert document state:', {
        xmlTextLength: xmlText.length,
        xmlTextContent: xmlText.toString()
      })
    }
    
    console.log('✅ [SPLICE-TEXT] Completed Loro CRDT modifications')
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

    console.log('📝 [TEXT-SYNC] CollabTextNode syncPropertiesFromLexical:', {
      nodeKey: nextLexicalNode.__key,
      nextText: nextText,
      hasPrevNode: prevLexicalNode !== null,
      prevText: prevLexicalNode?.__text || 'null',
      textChanged: prevLexicalNode !== null && prevLexicalNode.__text !== nextText
    })

    if (prevLexicalNode !== null) {
      const prevText = prevLexicalNode.__text;

      if (prevText !== nextText) {
        console.log('🔄 [TEXT-DIFF] Applying text delta:', {
          nodeKey: nextLexicalNode.__key,
          prevText,
          nextText,
          change: `"${prevText}" → "${nextText}"`
        })
        const key = nextLexicalNode.__key;
        $diffTextContentAndApplyDelta(this, key, prevText, nextText);
        this._text = nextText;
      } else {
        console.log('⚪ [TEXT-SAME] Text unchanged, skipping delta')
      }
    } else {
      console.log('🆕 [TEXT-NEW] No previous node, this is a new text node')
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

    if (lexicalNode.__text !== collabText) {
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
  
  // Set the __type property in the LoroMap so getNodeTypeFromSharedType can find it
  map.set('__type', type);
  
  (map as any)._collabNode = collabNode;
  return collabNode;
}
