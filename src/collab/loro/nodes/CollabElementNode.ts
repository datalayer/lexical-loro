import type {Binding} from '../State';
import type {ElementNode, NodeKey, NodeMap} from 'lexical';
import {XmlText} from '../types/XmlText';
import {$createChildrenArray} from '@lexical/offset';
import {
  $createTextNode,
  $getNodeByKey,
  $getNodeByKeyOrThrow,
  $isDecoratorNode,
  $isElementNode,
  $isTextNode,
  removeFromParent,
} from 'lexical';
import invariant from '../../utils/invariant';
import {CollabDecoratorNode} from './CollabDecoratorNode';
import {CollabLineBreakNode} from './CollabLineBreakNode';
import {CollabTextNode} from './CollabTextNode';
import {
  $createCollabNodeFromLexicalNode,
  $getOrInitCollabNodeFromSharedType,
  $syncPropertiesFromCRDT,
  createLexicalNodeFromCollabNode,
  getPositionFromElementAndOffset,
  spliceString,
  syncPropertiesFromLexical,
} from '../Utils';

type IntentionallyMarkedAsDirtyElement = boolean;

export class CollabElementNode {
  _key: NodeKey;
  _children: Array<
    | CollabElementNode
    | CollabTextNode
    | CollabDecoratorNode
    | CollabLineBreakNode
  >;
  _xmlText: XmlText;
  _type: string;
  _parent: null | CollabElementNode;

  constructor(
    xmlText: XmlText,
    parent: null | CollabElementNode,
    type: string,
  ) {
    this._key = '';
    this._children = [];
    this._xmlText = xmlText;
    this._type = type;
    this._parent = parent;
  }

  getPrevNode(nodeMap: null | NodeMap): null | ElementNode {
    if (nodeMap === null) {
      return null;
    }

    const node = nodeMap.get(this._key);
    return $isElementNode(node) ? node : null;
  }

  getNode(): null | ElementNode {
    const node = $getNodeByKey(this._key);
    return $isElementNode(node) ? node : null;
  }

  getSharedType(): XmlText {
    return this._xmlText;
  }

  getType(): string {
    return this._type;
  }

  getKey(): NodeKey {
    return this._key;
  }

  isEmpty(): boolean {
    return this._children.length === 0;
  }

  getSize(): number {
    return 1;
  }

  getOffset(): number {
    const collabElementNode = this._parent;
    invariant(
      collabElementNode !== null,
      'getOffset: could not find collab element node',
    );

    return collabElementNode.getChildOffset(this);
  }

  syncPropertiesFromCRDT(
    binding: Binding,
    keysChanged: null | Set<string>,
  ): void {
    const lexicalNode = this.getNode();
    invariant(
      lexicalNode !== null,
      'syncPropertiesFromCRDT: could not find element node',
    );
    $syncPropertiesFromCRDT(binding, this._xmlText, lexicalNode, keysChanged);
  }

  applyChildrenCRDTDelta(
    binding: Binding,
    deltas: Array<{
      insert?: string | object | XmlText;
      delete?: number;
      retain?: number;
      attributes?: {
        [x: string]: unknown;
      };
    }>,
  ): void {
    console.log(`🔧 [CollabElementNode.applyChildrenCRDTDelta] ENTRY: {nodeKey: '${this._key}', nodeType: '${this._type}', deltasLength: ${deltas.length}, childrenCount: ${this._children.length}}`);
    console.log(`📋 [CollabElementNode.applyChildrenCRDTDelta] Deltas:`, deltas);
    
    const children = this._children;
    let currIndex = 0;
    let pendingSplitText = null;

    for (let i = 0; i < deltas.length; i++) {
      const delta = deltas[i];
      const insertDelta = delta.insert;
      const deleteDelta = delta.delete;

      if (delta.retain != null) {
        currIndex += delta.retain;
      } else if (typeof deleteDelta === 'number') {
        let deletionSize = deleteDelta;

        while (deletionSize > 0) {
          const {node, nodeIndex, offset, length} =
            getPositionFromElementAndOffset(this, currIndex, false);

          if (
            node instanceof CollabElementNode ||
            node instanceof CollabLineBreakNode ||
            node instanceof CollabDecoratorNode
          ) {
            children.splice(nodeIndex, 1);
            deletionSize -= 1;
          } else if (node instanceof CollabTextNode) {
            const delCount = Math.min(deletionSize, length);
            const prevCollabNode =
              nodeIndex !== 0 ? children[nodeIndex - 1] : null;
            const nodeSize = node.getSize();

            if (offset === 0 && length === nodeSize) {
              // Text node has been deleted.
              children.splice(nodeIndex, 1);
              // If this was caused by an undo from YJS, there could be dangling text.
              const danglingText = spliceString(
                node._text,
                offset,
                delCount - 1,
                '',
              );
              if (danglingText.length > 0) {
                if (prevCollabNode instanceof CollabTextNode) {
                  // Merge the text node with previous.
                  prevCollabNode._text += danglingText;
                } else {
                  // No previous text node to merge into, just delete the text.
                  this._xmlText.delete(offset, danglingText.length);
                }
              }
            } else {
              node._text = spliceString(node._text, offset, delCount, '');
            }

            deletionSize -= delCount;
          } else {
            // Can occur due to the deletion from the dangling text heuristic below.
            break;
          }
        }
      } else if (insertDelta != null) {
        if (typeof insertDelta === 'string') {
          const {node, offset} = getPositionFromElementAndOffset(
            this,
            currIndex,
            true,
          );

          if (node instanceof CollabTextNode) {
            node._text = spliceString(node._text, offset, 0, insertDelta);
          } else {
            // TODO: maybe we can improve this by keeping around a redundant
            // text node map, rather than removing all the text nodes, so there
            // never can be dangling text.

            // We have a conflict where there was likely a CollabTextNode and
            // an Lexical TextNode too, but they were removed in a merge. So
            // let's just ignore the text and trigger a removal for it from our
            // shared type.
            this._xmlText.delete(offset, insertDelta.length);
          }

          currIndex += insertDelta.length;
        } else {
          const sharedType = insertDelta;
          const {node, nodeIndex, length} = getPositionFromElementAndOffset(
            this,
            currIndex,
            false,
          );
          const collabNode = $getOrInitCollabNodeFromSharedType(
            binding,
            sharedType as XmlText,
            this,
          );
          if (
            node instanceof CollabTextNode &&
            length > 0 &&
            length < node._text.length
          ) {
            // Trying to insert in the middle of a text node; split the text.
            const text = node._text;
            const splitIdx = text.length - length;
            node._text = spliceString(text, splitIdx, length, '');
            children.splice(nodeIndex + 1, 0, collabNode);
            // The insert that triggers the text split might not be a text node. Need to keep a
            // reference to the remaining text so that it can be added when we do create one.
            pendingSplitText = spliceString(text, 0, splitIdx, '');
          } else {
            children.splice(nodeIndex, 0, collabNode);
          }
          if (
            pendingSplitText !== null &&
            collabNode instanceof CollabTextNode
          ) {
            // Found a text node to insert the pending text into.
            collabNode._text = pendingSplitText + collabNode._text;
            pendingSplitText = null;
          }
          currIndex += 1;
        }
      } else {
        throw new Error('Unexpected delta format');
      }
    }
  }

  private _syncChildrenFromXmlTextEmbeds(binding: Binding): void {
    console.log('🔧 [_syncChildrenFromXmlTextEmbeds] ENTRY:', {
      nodeKey: this._key,
      currentChildrenCount: this._children.length
    });

    // Get all embed entries from the XmlText
    const embedEntries = this._xmlText.getEmbedEntries();

    console.log('📋 [_syncChildrenFromXmlTextEmbeds] Found embeds:', {
      embedCount: embedEntries.length,
      embedKeys: embedEntries.map(e => e.key)
    });

    // Process each embed to ensure corresponding CollabElementNode exists in _children
    for (const embedEntry of embedEntries) {
      const embedData = embedEntry.value as any;
      
      if (embedData.object && embedData.object.textId) {
        const textId = embedData.object.textId;
        console.log('🎯 [_syncChildrenFromXmlTextEmbeds] Processing embedded XmlText:', {
          embedKey: embedEntry.key,
          textId: textId,
          offset: embedData.offset
        });

        // Check if we already have a CollabElementNode for this textId
        const existingChild = this._children.find(child => 
          child instanceof CollabElementNode && child._xmlText.getId() === textId
        );

        if (!existingChild) {
          console.log('➕ [_syncChildrenFromXmlTextEmbeds] Creating new CollabElementNode for embedded XmlText');
          
          // Create new CollabElementNode for the embedded XmlText
          try {
            // Create XmlText instance using the textId
            const embeddedXmlText = new XmlText(binding.doc, textId);
            console.log('🎯 [_syncChildrenFromXmlTextEmbeds] Created XmlText with ID:', textId);
            
            const collabNode = $getOrInitCollabNodeFromSharedType(
              binding,
              embeddedXmlText,
              this
            );
            
            // Add to _children if not already present
            if (collabNode && !this._children.includes(collabNode)) {
              this._children.push(collabNode);
              console.log('✅ [_syncChildrenFromXmlTextEmbeds] Added CollabElementNode to _children:', {
                childKey: collabNode._key,
                childType: collabNode._type,
                newChildrenCount: this._children.length
              });
            }
          } catch (error) {
            console.warn('⚠️ [_syncChildrenFromXmlTextEmbeds] Failed to create CollabElementNode for embed:', error);
          }
        } else {
          console.log('✅ [_syncChildrenFromXmlTextEmbeds] CollabElementNode already exists for textId:', textId);
        }
      }
    }

    console.log('🏁 [_syncChildrenFromXmlTextEmbeds] COMPLETE:', {
      finalChildrenCount: this._children.length,
      childrenKeys: this._children.map(c => c._key),
      childrenTypes: this._children.map(c => c._type)
    });
  }

  syncChildrenFromCRDT(binding: Binding): void {
    console.log('🔄 [CollabElementNode.syncChildrenFromCRDT] ENTRY:', {
      nodeKey: this._key,
      nodeType: this._type,
      collabChildrenCount: this._children.length,
      xmlTextLength: this._xmlText.length
    });
    
    // First, ensure _children reflects the current CRDT state by processing embeds
    this._syncChildrenFromXmlTextEmbeds(binding);
    
    // Now diff the children of the collab node with that of our existing Lexical node.
    const lexicalNode = this.getNode();
    invariant(
      lexicalNode !== null,
      'syncChildrenFromCRDT: could not find element node',
    );
    
    console.log('📋 [CollabElementNode.syncChildrenFromCRDT] Lexical node found:', {
      lexicalNodeKey: lexicalNode.__key,
      lexicalNodeType: lexicalNode.getType(),
      lexicalChildrenCount: lexicalNode.getChildren().length,
      lexicalChildrenKeys: lexicalNode.getChildren().map(c => c.getKey()),
      lexicalChildrenTypes: lexicalNode.getChildren().map(c => c.getType())
    });

    const key = lexicalNode.__key;
    const prevLexicalChildrenKeys = $createChildrenArray(lexicalNode, null);
    const nextLexicalChildrenKeys: Array<NodeKey> = [];
    const lexicalChildrenKeysLength = prevLexicalChildrenKeys.length;
    const collabChildren = this._children;
    const collabChildrenLength = collabChildren.length;
    const collabNodeMap = binding.collabNodeMap;
    const visitedKeys = new Set();
    let collabKeys;
    let writableLexicalNode;
    let prevIndex = 0;
    let prevChildNode = null;

    console.log('📊 [CollabElementNode.syncChildrenFromCRDT] Children comparison:', {
      prevLexicalChildrenKeysLength: lexicalChildrenKeysLength,
      collabChildrenLength: collabChildrenLength,
      prevLexicalChildrenKeys,
      collabChildrenTypes: collabChildren.map(c => c.constructor.name),
      collabChildrenKeys: collabChildren.map(c => c._key),
      needsWritableNode: collabChildrenLength !== lexicalChildrenKeysLength,
      hasXmlTextContent: this._xmlText.length > 0
    });

    // Special case: if we have text content in XmlText but no CollabNode children,
    // we need to sync the text content to Lexical text nodes
    if (collabChildrenLength === 0 && this._xmlText.length > 0) {
      console.log('📝 [CollabElementNode.syncChildrenFromCRDT] Syncing XmlText content to Lexical (no CollabTextNode children)');
      const textContent = this._xmlText.toPlainString();
      console.log('📋 [CollabElementNode.syncChildrenFromCRDT] XmlText content:', textContent);
      
      if (textContent.length > 0) {
        writableLexicalNode = lexicalNode.getWritable();
        
        if (lexicalChildrenKeysLength === 0) {
          // No Lexical children - create a new text node
          console.log('📝 [CollabElementNode.syncChildrenFromCRDT] Creating new Lexical text node');
          const textNode = $createTextNode(textContent);
          writableLexicalNode.append(textNode);
          console.log('✅ [CollabElementNode.syncChildrenFromCRDT] Created Lexical text node with content:', textContent);
        } else {
          // Update existing Lexical children - assume first child is text node
          const firstChild = lexicalNode.getFirstChild();
          if ($isTextNode(firstChild)) {
            console.log('📝 [CollabElementNode.syncChildrenFromCRDT] Updating existing Lexical text node');
            console.log('📋 [CollabElementNode.syncChildrenFromCRDT] Current text:', firstChild.getTextContent());
            console.log('📋 [CollabElementNode.syncChildrenFromCRDT] New text:', textContent);
            firstChild.setTextContent(textContent);
            console.log('✅ [CollabElementNode.syncChildrenFromCRDT] Updated text node content to:', textContent);
          } else {
            console.log('📝 [CollabElementNode.syncChildrenFromCRDT] First child is not text, replacing with text node');
            // Replace non-text child with text node
            firstChild?.remove();
            const textNode = $createTextNode(textContent);
            writableLexicalNode.append(textNode);
            console.log('✅ [CollabElementNode.syncChildrenFromCRDT] Replaced with text node:', textContent);
          }
        }
        return; // Early return since we handled the text content directly
      }
    }

    if (collabChildrenLength !== lexicalChildrenKeysLength) {
      writableLexicalNode = lexicalNode.getWritable();
      console.log('✏️ [CollabElementNode.syncChildrenFromCRDT] Created writable lexical node');
    }

    for (let i = 0; i < collabChildrenLength; i++) {
      const lexicalChildKey = prevLexicalChildrenKeys[prevIndex];
      const childCollabNode = collabChildren[i];
      const collabLexicalChildNode = childCollabNode.getNode();
      const collabKey = childCollabNode._key;
      
      console.log(`🔄 [CollabElementNode.syncChildrenFromCRDT] Processing child ${i}/${collabChildrenLength}:`, {
        i,
        prevIndex,
        lexicalChildKey,
        collabKey,
        childType: childCollabNode.constructor.name,
        hasLexicalNode: collabLexicalChildNode !== null,
        lexicalNodeType: collabLexicalChildNode?.getType()
      });

      if (collabLexicalChildNode !== null && lexicalChildKey === collabKey) {
        // Keep Y.js alignment: only TextNodes need updating in syncChildrenFromCRDT
        const childNeedsUpdating = $isTextNode(collabLexicalChildNode);
        console.log(`✅ [CollabElementNode.syncChildrenFromCRDT] Update path - matching child found:`, {
          childNeedsUpdating,
          lexicalNodeType: collabLexicalChildNode.getType(),
          isTextNode: childNeedsUpdating
        });
        // Update
        visitedKeys.add(lexicalChildKey);

        if (childNeedsUpdating) {
          console.log(`🔄 [CollabElementNode.syncChildrenFromCRDT] Child needs updating - processing sync`);
          childCollabNode._key = lexicalChildKey;

          if (childCollabNode instanceof CollabElementNode) {
            console.log(`🔄 [CollabElementNode.syncChildrenFromCRDT] Syncing CollabElementNode child (YJS-style)`);
            const xmlText = childCollabNode._xmlText;
            console.log(`📋 [CollabElementNode.syncChildrenFromCRDT] XmlText delta:`, xmlText.toDelta());
            childCollabNode.syncPropertiesFromCRDT(binding, null);
            childCollabNode.applyChildrenCRDTDelta(binding, xmlText.toDelta());
            childCollabNode.syncChildrenFromCRDT(binding);
          } else if (childCollabNode instanceof CollabTextNode) {
            console.log(`📝 [CollabElementNode.syncChildrenFromCRDT] Calling syncPropertiesAndTextFromCRDT for CollabTextNode`);
            childCollabNode.syncPropertiesAndTextFromCRDT(binding, null);
          } else if (childCollabNode instanceof CollabDecoratorNode) {
            childCollabNode.syncPropertiesFromCRDT(binding, null);
          } else if (!(childCollabNode instanceof CollabLineBreakNode)) {
            invariant(
              false,
              'syncChildrenFromCRDT: expected text, element, decorator, or linebreak collab node',
            );
          }
        } else {
          console.log(`⏭️ [CollabElementNode.syncChildrenFromCRDT] Child doesn't need updating - skipping sync`);
        }

        nextLexicalChildrenKeys[i] = lexicalChildKey;
        prevChildNode = collabLexicalChildNode;
        prevIndex++;
      } else {
        console.log(`🆕 [CollabElementNode.syncChildrenFromCRDT] Create/Replace path - no matching child found`);
        if (collabKeys === undefined) {
          collabKeys = new Set();

          for (let s = 0; s < collabChildrenLength; s++) {
            const child = collabChildren[s];
            const childKey = child._key;

            if (childKey !== '') {
              collabKeys.add(childKey);
            }
          }
        }

        if (
          collabLexicalChildNode !== null &&
          lexicalChildKey !== undefined &&
          !collabKeys.has(lexicalChildKey)
        ) {
          const nodeToRemove = $getNodeByKeyOrThrow(lexicalChildKey);
          removeFromParent(nodeToRemove);
          i--;
          prevIndex++;
          continue;
        }

        writableLexicalNode = lexicalNode.getWritable();
        // Create/Replace
        console.log(`🔨 [CollabElementNode.syncChildrenFromCRDT] Creating lexical node from collab node:`, {
          collabNodeType: childCollabNode.constructor.name,
          collabKey: childCollabNode._key
        });
        const lexicalChildNode = createLexicalNodeFromCollabNode(
          binding,
          childCollabNode,
          key,
        );
        const childKey = lexicalChildNode.__key;
        console.log(`✨ [CollabElementNode.syncChildrenFromCRDT] Created lexical node:`, {
          lexicalNodeType: lexicalChildNode.getType(),
          lexicalNodeKey: childKey,
          text: lexicalChildNode.getTextContent ? lexicalChildNode.getTextContent() : 'N/A'
        });
        collabNodeMap.set(childKey, childCollabNode);
        nextLexicalChildrenKeys[i] = childKey;
        if (prevChildNode === null) {
          const nextSibling = writableLexicalNode.getFirstChild();
          writableLexicalNode.__first = childKey;
          if (nextSibling !== null) {
            const writableNextSibling = nextSibling.getWritable();
            writableNextSibling.__prev = childKey;
            lexicalChildNode.__next = writableNextSibling.__key;
          }
        } else {
          const writablePrevChildNode = prevChildNode.getWritable();
          const nextSibling = prevChildNode.getNextSibling();
          writablePrevChildNode.__next = childKey;
          lexicalChildNode.__prev = prevChildNode.__key;
          if (nextSibling !== null) {
            const writableNextSibling = nextSibling.getWritable();
            writableNextSibling.__prev = childKey;
            lexicalChildNode.__next = writableNextSibling.__key;
          }
        }
        if (i === collabChildrenLength - 1) {
          writableLexicalNode.__last = childKey;
        }
        writableLexicalNode.__size++;
        prevChildNode = lexicalChildNode;
      }
    }

    for (let i = 0; i < lexicalChildrenKeysLength; i++) {
      const lexicalChildKey = prevLexicalChildrenKeys[i];

      if (!visitedKeys.has(lexicalChildKey)) {
        // Remove
        const lexicalChildNode = $getNodeByKeyOrThrow(lexicalChildKey);
        const collabNode = binding.collabNodeMap.get(lexicalChildKey);

        if (collabNode !== undefined) {
          collabNode.destroy(binding);
        }
        removeFromParent(lexicalChildNode);
      }
    }
  }

  syncPropertiesFromLexical(
    binding: Binding,
    nextLexicalNode: ElementNode,
    prevNodeMap: null | NodeMap,
  ): void {
    syncPropertiesFromLexical(
      binding,
      this._xmlText,
      this.getPrevNode(prevNodeMap),
      nextLexicalNode,
    );
  }

  _syncChildFromLexical(
    binding: Binding,
    index: number,
    key: NodeKey,
    prevNodeMap: null | NodeMap,
    dirtyElements: null | Map<NodeKey, IntentionallyMarkedAsDirtyElement>,
    dirtyLeaves: null | Set<NodeKey>,
  ): void {
    console.log('🔧 _syncChildFromLexical ENTRY:', {
      index,
      key,
      childrenLength: this._children.length,
      hasDirtyElements: !!dirtyElements,
      hasDirtyLeaves: !!dirtyLeaves
    });
    
    const childCollabNode = this._children[index];
    // Update
    const nextChildNode = $getNodeByKeyOrThrow(key);
    
    console.log('🎯 _syncChildFromLexical - Node types:', {
      childCollabNodeType: childCollabNode?.constructor?.name,
      nextChildNodeType: nextChildNode?.getType(),
      isCollabElement: childCollabNode instanceof CollabElementNode,
      isLexicalElement: $isElementNode(nextChildNode),
      isCollabText: childCollabNode instanceof CollabTextNode,
      isLexicalText: $isTextNode(nextChildNode),
      childCollabNodeExists: !!childCollabNode
    });

    if (!childCollabNode) {
      console.error('❌ _syncChildFromLexical: childCollabNode is undefined at index', index);
      console.error('❌ Children array length:', this._children.length);
      console.error('❌ Children array contents:', this._children.map(c => c?.constructor?.name));
      return;
    }

    if (
      childCollabNode instanceof CollabElementNode &&
      $isElementNode(nextChildNode)
    ) {
      childCollabNode.syncPropertiesFromLexical(
        binding,
        nextChildNode,
        prevNodeMap,
      );
      childCollabNode.syncChildrenFromLexical(
        binding,
        nextChildNode,
        prevNodeMap,
        dirtyElements,
        dirtyLeaves,
      );
    } else if (
      childCollabNode instanceof CollabTextNode &&
      $isTextNode(nextChildNode)
    ) {
      childCollabNode.syncPropertiesAndTextFromLexical(
        binding,
        nextChildNode,
        prevNodeMap,
      );
    } else if (
      childCollabNode instanceof CollabDecoratorNode &&
      $isDecoratorNode(nextChildNode)
    ) {
      childCollabNode.syncPropertiesFromLexical(
        binding,
        nextChildNode,
        prevNodeMap,
      );
    }
  }

  syncChildrenFromLexical(
    binding: Binding,
    nextLexicalNode: ElementNode,
    prevNodeMap: null | NodeMap,
    dirtyElements: null | Map<NodeKey, IntentionallyMarkedAsDirtyElement>,
    dirtyLeaves: null | Set<NodeKey>,
  ): void {
    console.log('📝 CollabElementNode.syncChildrenFromLexical ENTRY', {
      nodeKey: this._key,
      nodeType: nextLexicalNode.getType(),
      hasDirtyElements: !!dirtyElements,
      hasDirtyLeaves: !!dirtyLeaves,
      dirtyElementsKeys: dirtyElements ? Array.from(dirtyElements.keys()) : [],
      dirtyLeavesKeys: dirtyLeaves ? Array.from(dirtyLeaves) : []
    });
    
    const prevLexicalNode = this.getPrevNode(prevNodeMap);
    const prevChildren =
      prevLexicalNode === null
        ? []
        : $createChildrenArray(prevLexicalNode, prevNodeMap);
    const nextChildren = $createChildrenArray(nextLexicalNode, null);
    const prevEndIndex = prevChildren.length - 1;
    const nextEndIndex = nextChildren.length - 1;
    const collabNodeMap = binding.collabNodeMap;
    
    console.log('📋 CollabElementNode.syncChildrenFromLexical - Children comparison:', {
      prevChildrenCount: prevChildren.length,
      nextChildrenCount: nextChildren.length,
      prevChildren: prevChildren,
      nextChildren: nextChildren,
      prevEndIndex,
      nextEndIndex
    });
    
    let prevChildrenSet: Set<NodeKey> | undefined;
    let nextChildrenSet: Set<NodeKey> | undefined;
    let prevIndex = 0;
    let nextIndex = 0;

    while (prevIndex <= prevEndIndex && nextIndex <= nextEndIndex) {
      const prevKey = prevChildren[prevIndex];
      const nextKey = nextChildren[nextIndex];

      console.log('🔄 CollabElementNode sync loop iteration:', {
        prevIndex,
        nextIndex,
        prevKey,
        nextKey,
        keysMatch: prevKey === nextKey
      });

      if (prevKey === nextKey) {
        // No move, create or remove - sync existing child
        console.log('⚡ Calling _syncChildFromLexical for existing child:', nextKey);
        this._syncChildFromLexical(
          binding,
          nextIndex,
          nextKey,
          prevNodeMap,
          dirtyElements,
          dirtyLeaves,
        );

        prevIndex++;
        nextIndex++;
      } else {
        if (prevChildrenSet === undefined) {
          prevChildrenSet = new Set(prevChildren);
        }

        if (nextChildrenSet === undefined) {
          nextChildrenSet = new Set(nextChildren);
        }

        const nextHasPrevKey = nextChildrenSet.has(prevKey);
        const prevHasNextKey = prevChildrenSet.has(nextKey);

        if (!nextHasPrevKey) {
          // Remove
          this.splice(binding, nextIndex, 1);
          prevIndex++;
        } else {
          // Create or replace
          console.log('🆕 Creating new CollabNode for key:', nextKey);
          const nextChildNode = $getNodeByKeyOrThrow(nextKey);
          const collabNode = $createCollabNodeFromLexicalNode(
            binding,
            nextChildNode,
            this,
          );
          collabNodeMap.set(nextKey, collabNode);
          console.log('🔗 Created CollabNode:', {
            key: nextKey,
            nodeType: nextChildNode.getType(),
            collabNodeType: collabNode.constructor.name
          });

          if (prevHasNextKey) {
            console.log('🔄 Replacing existing child at index:', nextIndex);
            this.splice(binding, nextIndex, 1, collabNode);
            prevIndex++;
            nextIndex++;
          } else {
            console.log('➕ Inserting new child at index:', nextIndex);  
            this.splice(binding, nextIndex, 0, collabNode);
            nextIndex++;
          }
        }
      }
    }

    const appendNewChildren = prevIndex > prevEndIndex;
    const removeOldChildren = nextIndex > nextEndIndex;

    if (appendNewChildren && !removeOldChildren) {
      console.log('📝 Appending new children:', {
        nextIndex,
        nextEndIndex,
        keysToAppend: nextChildren.slice(nextIndex, nextEndIndex + 1)
      });
      
      for (; nextIndex <= nextEndIndex; ++nextIndex) {
        const key = nextChildren[nextIndex];
        const nextChildNode = $getNodeByKeyOrThrow(key);
        const collabNode = $createCollabNodeFromLexicalNode(
          binding,
          nextChildNode,
          this,
        );
        console.log('➕ Appending CollabNode:', {
          key,
          nodeType: nextChildNode.getType(),
          collabNodeType: collabNode.constructor.name
        });
        this.append(collabNode);
        collabNodeMap.set(key, collabNode);
      }
    } else if (removeOldChildren && !appendNewChildren) {
      for (let i = this._children.length - 1; i >= nextIndex; i--) {
        this.splice(binding, i, 1);
      }
    }
  }

  append(
    collabNode:
      | CollabElementNode
      | CollabDecoratorNode
      | CollabTextNode
      | CollabLineBreakNode,
  ): void {
    const xmlText = this._xmlText;
    const children = this._children;
    const lastChild = children[children.length - 1];
    const offset =
      lastChild !== undefined ? lastChild.getOffset() + lastChild.getSize() : 0;

    if (collabNode instanceof CollabElementNode) {
      xmlText.insertEmbed(offset, collabNode._xmlText);
    } else if (collabNode instanceof CollabTextNode) {
      const map = collabNode._map;

      if (map.parent === null) {
        xmlText.insertEmbed(offset, map);
      }

      xmlText.insert(offset + 1, collabNode._text);
    } else if (collabNode instanceof CollabLineBreakNode) {
      xmlText.insertEmbed(offset, collabNode._map);
    } else if (collabNode instanceof CollabDecoratorNode) {
      xmlText.insertEmbed(offset, collabNode._map);
    }

    this._children.push(collabNode);
  }

  splice(
    binding: Binding,
    index: number,
    delCount: number,
    collabNode?:
      | CollabElementNode
      | CollabDecoratorNode
      | CollabTextNode
      | CollabLineBreakNode,
  ): void {
    const children = this._children;
    const child = children[index];

    if (child === undefined) {
      invariant(
        collabNode !== undefined,
        'splice: could not find collab element node',
      );
      this.append(collabNode);
      return;
    }

    const offset = child.getOffset();
    invariant(offset !== -1, 'splice: expected offset to be greater than zero');

    const xmlText = this._xmlText;

    if (delCount !== 0) {
      // What if we delete many nodes, don't we need to get all their
      // sizes?
      xmlText.delete(offset, child.getSize());
    }

    if (collabNode instanceof CollabElementNode) {
      xmlText.insertEmbed(offset, collabNode._xmlText);
    } else if (collabNode instanceof CollabTextNode) {
      const map = collabNode._map;

      if (map.parent === null) {
        xmlText.insertEmbed(offset, map);
      }

      xmlText.insert(offset + 1, collabNode._text);
    } else if (collabNode instanceof CollabLineBreakNode) {
      xmlText.insertEmbed(offset, collabNode._map);
    } else if (collabNode instanceof CollabDecoratorNode) {
      xmlText.insertEmbed(offset, collabNode._map);
    }

    if (delCount !== 0) {
      const childrenToDelete = children.slice(index, index + delCount);

      for (let i = 0; i < childrenToDelete.length; i++) {
        childrenToDelete[i].destroy(binding);
      }
    }

    if (collabNode !== undefined) {
      children.splice(index, delCount, collabNode);
    } else {
      children.splice(index, delCount);
    }
  }

  getChildOffset(
    collabNode:
      | CollabElementNode
      | CollabTextNode
      | CollabDecoratorNode
      | CollabLineBreakNode,
  ): number {
    let offset = 0;
    const children = this._children;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      if (child === collabNode) {
        return offset;
      }

      offset += child.getSize();
    }

    return -1;
  }

  destroy(binding: Binding): void {
    const collabNodeMap = binding.collabNodeMap;
    const children = this._children;

    for (let i = 0; i < children.length; i++) {
      children[i].destroy(binding);
    }

    if (collabNodeMap.get(this._key) === this) {
      collabNodeMap.delete(this._key);
    }
  }
}

export function $createCollabElementNode(
  xmlText: XmlText,
  parent: null | CollabElementNode,
  type: string,
): CollabElementNode {
  const collabNode = new CollabElementNode(xmlText, parent, type);
  (xmlText as any)._collabNode = collabNode;
  return collabNode;
}
