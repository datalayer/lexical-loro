import type {ElementNode, NodeKey, NodeMap} from 'lexical';
import {$createChildrenArray} from '@lexical/offset';
import {
  $getNodeByKey,
  $getNodeByKeyOrThrow,
  $isDecoratorNode,
  $isElementNode,
  $isTextNode,
  removeFromParent,
} from 'lexical';
import {XmlText} from '../types/XmlText';
import {LoroMap} from 'loro-crdt';
import invariant from '../../utils/invariant';
import {
  $createCollabNodeFromLexicalNode,
  $getOrInitCollabNodeFromSharedType,
  $syncPropertiesFromCRDT,
  createLexicalNodeFromCollabNode,
  getPositionFromElementAndOffset,
  spliceString,
  syncPropertiesFromLexical,
} from '../utils/Utils';
import type {Binding} from '../Bindings';
import {CollabDecoratorNode} from './CollabDecoratorNode';
import {CollabLineBreakNode} from './CollabLineBreakNode';
import {CollabTextNode} from './CollabTextNode';
import {AnyCollabNode} from './AnyCollabNode';

type IntentionallyMarkedAsDirtyElement = boolean;

export class CollabElementNode {
  _key: NodeKey;
  _children: Array<AnyCollabNode>;
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

  // Debug method to log the hierarchy structure
  logHierarchy(prefix = ""): void {
    console.log(`${prefix}${this.constructor.name}(${this._key}) [${this.getType()}] - ${this._children.length} children`);
    this._children.forEach((child, index) => {
      if (child && typeof (child as any).logHierarchy === 'function') {
        (child as any).logHierarchy(`${prefix}  ${index}: `);
      } else {
        console.log(`${prefix}  ${index}: ${child ? child.constructor.name : 'null'}(${child ? (child as any)._key : 'no-key'})`);
      }
    });
  }

  private _syncChildrenFromXmlTextEmbeds(binding: Binding): void {
    try {
      // Get all embed entries from the XmlText
      const embedEntries = this._xmlText.getEmbedEntries();

      // Track processed containers to avoid duplicates
      const processedContainers = new Set<string>();
      
      // Process each embed to ensure corresponding CollabElementNode exists in _children
      for (const embedEntry of embedEntries) {
        const embedData = embedEntry.value as any;
        
        // Handle XmlText references (element nodes) and LoroMap references (text nodes)
        if (embedData.object && embedData.object.textId) {
          const textId = embedData.object.textId;
          
          // Skip if we've already processed this container
          if (processedContainers.has(textId)) {
            continue;
          }
          processedContainers.add(textId);
          
          // First check if this is actually a LoroMap container (for CollabTextNode)
          try {
            const container = binding.doc.getContainerById(textId);
            
            // Check if it's a LoroMap (should create CollabTextNode)
            if (container && container.constructor.name === 'LoroMap') {
              // Check if we already have a CollabTextNode for this mapId
              const existingChild = this._children.find(child => 
                child instanceof CollabTextNode && (child._map as any).id === textId
              );

              if (!existingChild) {
                const loroMap = container as LoroMap<Record<string, unknown>>;
                
                // Get the type from the map
                const nodeType = loroMap.get('__type') as string;
                if (nodeType) {
                  // 🚨 HIERARCHY FIX: Create text nodes and move to proper parent if needed
                  // 🚨 HIERARCHY FIX: Ensure text nodes are properly nested
                  if (this._key === 'root') {
                    continue;
                  }
                                    
                  {
                    // This is a proper element node (paragraph, etc.) - allow text node creation
                    try {
                      const collabTextNode = new CollabTextNode(loroMap, '', this, nodeType);
                      
                      // Extract the key from the textId
                      const keyMatch = textId.match(/text_(\w+):Map$/);
                      if (keyMatch) {
                        collabTextNode._key = `text_${keyMatch[1]}`;
                      } else {
                        console.warn(`🔧 [EMBED-SYNC] Could not extract key from textId: ${textId}`);
                      }
                      
                    } catch (error) {
                      console.error(`❌ [EMBED-SYNC] Error creating CollabTextNode for ${textId}:`, error);
                    }
                  }
                }
              }
            }
            // Check if it's a LoroText (might be related to CollabTextNode)
            else if (container && container.constructor.name === 'LoroText') {
              // For LoroText containers, we need to find the associated LoroMap
              // The pattern seems to be that CollabTextNode creates both:
              // 1. A LoroMap (for properties) - this is what we want
              // 2. A LoroText (for text content) - this is what we see in the embed
              
              // Try to find a LoroMap container with a similar ID pattern
              const mapId = textId.replace(':Text', ':Map');
              
              try {
                const mapContainer = binding.doc.getContainerById(mapId);
                
                if (mapContainer && mapContainer.constructor.name === 'LoroMap') {
                  // Check if we already have a CollabTextNode for this mapId
                  const existingChild = this._children.find(child => 
                    child instanceof CollabTextNode && (child._map as any).id === mapId
                  );

                  if (!existingChild) {
                    const loroMap = mapContainer as LoroMap<Record<string, unknown>>;
                    
                    // Get the type from the map
                    let nodeType = loroMap.get('__type') as string;
                    
                    // Fallback for existing LoroMaps that don't have __type set
                    if (!nodeType && embedData.object.type === 'xmltext_ref') {
                      nodeType = 'text';
                      // Set the __type for future use
                      loroMap.set('__type', nodeType);
                    }
                    
                    if (nodeType) {
                      // 🚨 HIERARCHY FIX: Create text nodes and then move to proper parent if needed
                      // 🚨 HIERARCHY FIX: Defer text node creation at root level
                      if (this._key === 'root') {
                        console.log(`🔄 [HIERARCHY-FIX] Deferring text node creation at root level for mapId: ${mapId}`);
                        continue;
                      }
                                            
                      {
                        // Create text node first, then move to proper parent if needed
                        try {
                          const collabTextNode = new CollabTextNode(loroMap, '', this, nodeType);
                          
                          // Extract the key from the mapId (e.g., "cid:root-element_1:Map" -> "1")
                          const keyMatch = mapId.match(/element_(\w+):Map$/);
                          if (keyMatch) {
                            collabTextNode._key = keyMatch[1];
                          } else {
                            console.warn(`🔧 [EMBED-SYNC] Could not extract key from mapId: ${mapId}`);
                          }
                          
                        } catch (error) {
                          console.error(`❌ [EMBED-SYNC] Error creating CollabTextNode for ${mapId}:`, error);
                        }
                      }
                    } else {
                      console.warn(`⚠️ [EMBED-SYNC] No nodeType found in LoroMap for ${mapId}`);
                    }
                  }
                }
              } catch (error) {
                console.error(`🔧 [EMBED-SYNC] Could not find LoroMap for ${mapId}:`, error.message);
              }
            }
            // Check if it's a LoroText (XmlText wrapper - should create CollabElementNode) 
            else if (container && (container instanceof XmlText || container.constructor.name === 'LoroText')) {
              
              // Check if we already have a CollabElementNode for this textId
              const existingChild = this._children.find(child => 
                child instanceof CollabElementNode && child._xmlText.getId() === textId
              );
              
              // LoroText containers don't have getAttribute, we need to check attributes differently
              const hasType = (container as any).getAttribute ? 
                !!(container as any).getAttribute('__type') : 
                !!(container as any).getAttributes && !!(container as any).getAttributes()['__type'];
              
              if (!existingChild && hasType) {
                // Extract original key from container ID
                const containerIdStr = (container as any).id || '';
                const keyMatch = containerIdStr.match(/element_(\d+):/);
                const originalKey = keyMatch ? keyMatch[1] : undefined;
                
                // Cast container to XmlText for the helper methods
                const xmlTextContainer = container as any as XmlText;
                const collabNode = originalKey ? 
                  this._createCollabElementNodeWithKey(binding, xmlTextContainer, originalKey) :
                  $getOrInitCollabNodeFromSharedType(binding, xmlTextContainer, this);
                
                // Add to _children if not already present
                if (collabNode && !this._children.includes(collabNode)) {
                  this._children.push(collabNode);
                  
                  // Recursively sync children of the newly created CollabElementNode
                  if (collabNode instanceof CollabElementNode) {
                    collabNode.syncChildrenFromCRDT(binding);
                  }
                }
              }
            }
          } catch (error) {
            // Only log unexpected errors, not invariant failures from missing __type
            if (error.message && !error.message.includes('Expected shared type to include type attribute')) {
              console.warn('⚠️ [_syncChildrenFromXmlTextEmbeds] Error processing embed:', textId, error);
            }
          }
        }
        // Handle LoroMap references (text nodes)
        else if (embedData.object && embedData.object.type === 'loro_ref' && embedData.object.refType === 'LoroMap') {
          const mapId = embedData.object.id;
          
          // Check if we already have a CollabTextNode for this mapId
          const existingChild = this._children.find(child => 
            child instanceof CollabTextNode && child._map.id === mapId
          );

          if (!existingChild) {
            try {
              // Get the LoroMap from the document
              const container = binding.doc.getContainerById(mapId);
              
              if (container && (container.constructor.name === 'LoroMap' || container.toString().includes('LoroMap'))) {
                const loroMap = container as LoroMap<Record<string, unknown>>;
                const collabNode = $getOrInitCollabNodeFromSharedType(
                  binding,
                  loroMap,
                  this
                );
                
                // Add to _children if not already present
                if (collabNode && !this._children.includes(collabNode)) {
                  // 🚨 HIERARCHY FIX: Block text nodes at root level 
                  if (this._key === 'root' && collabNode instanceof CollabTextNode) {
                    console.warn(`⚠️ [HIERARCHY-FIX] BLOCKING text node addition at root level`);
                  } else {
                    // This is a proper element node - allow direct child addition
                    this._children.push(collabNode);
                  }
                }
              } else {
                console.warn(`⚠️ [EMBED-SYNC] Container not found or not LoroMap type for ${mapId}`);
              }
            } catch (error) {
              console.warn('⚠️ [_syncChildrenFromXmlTextEmbeds] Error processing LoroMap embed:', mapId, error);
            }
          } else {
            console.log(`🔧 [EMBED-SYNC] LoroMap CollabTextNode already exists for ${mapId}`);
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ [_syncChildrenFromXmlTextEmbeds] Error accessing embed entries:', error);
    }
    
  }

  private _createCollabElementNodeWithKey(
    binding: Binding, 
    container: XmlText, 
    originalKey: string
  ): CollabElementNode {
    const type = container.getAttribute('__type') as string;
    const collabNode = $createCollabElementNode(container, this, type, originalKey);
    return collabNode;
  }

  syncChildrenFromCRDT(binding: Binding): void {
    // First, ensure _children reflects the current CRDT state by processing embeds
    this._syncChildrenFromXmlTextEmbeds(binding);
    
    // Now diff the children of the collab node with that of our existing Lexical node.
    const lexicalNode = this.getNode();
    invariant(
      lexicalNode !== null,
      'syncChildrenFromCRDT: could not find element node',
    );
    
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

    // YJS-aligned approach: No special case handling for raw XmlText content
    // The proper CollabNode structure should always exist through normal CRDT operations
    // If there's a mismatch, it gets resolved through delta processing and proper node creation

    if (collabChildrenLength !== lexicalChildrenKeysLength) {
      writableLexicalNode = lexicalNode.getWritable();
    }

    for (let i = 0; i < collabChildrenLength; i++) {
      const lexicalChildKey = prevLexicalChildrenKeys[prevIndex];
      const childCollabNode = collabChildren[i];
      const collabLexicalChildNode = childCollabNode.getNode();
      const collabKey = childCollabNode._key;
      
      if (collabLexicalChildNode !== null && lexicalChildKey === collabKey) {
        // Keep Y.js alignment: only TextNodes need updating in syncChildrenFromCRDT
        const childNeedsUpdating = $isTextNode(collabLexicalChildNode);
        // Update
        visitedKeys.add(lexicalChildKey);

        if (childNeedsUpdating) {
          childCollabNode._key = lexicalChildKey;

          if (childCollabNode instanceof CollabElementNode) {
            const xmlText = childCollabNode._xmlText;
            childCollabNode.syncPropertiesFromCRDT(binding, null);
            childCollabNode.applyChildrenCRDTDelta(binding, xmlText.toDelta());
            childCollabNode.syncChildrenFromCRDT(binding);
          } else if (childCollabNode instanceof CollabTextNode) {
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
        const lexicalChildNode = createLexicalNodeFromCollabNode(
          binding,
          childCollabNode,
          key,
        );
        const childKey = lexicalChildNode.__key;
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
    const childCollabNode = this._children[index];
    // Update
    const nextChildNode = $getNodeByKeyOrThrow(key);

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
    const prevLexicalNode = this.getPrevNode(prevNodeMap);
    const prevChildren =
      prevLexicalNode === null
        ? []
        : $createChildrenArray(prevLexicalNode, prevNodeMap);
    const nextChildren = $createChildrenArray(nextLexicalNode, null);
    
    const prevEndIndex = prevChildren.length - 1;
    const nextEndIndex = nextChildren.length - 1;
    const collabNodeMap = binding.collabNodeMap;

    let prevChildrenSet: Set<NodeKey> | undefined;
    let nextChildrenSet: Set<NodeKey> | undefined;
    let prevIndex = 0;
    let nextIndex = 0;

    while (prevIndex <= prevEndIndex && nextIndex <= nextEndIndex) {
      const prevKey = prevChildren[prevIndex];
      const nextKey = nextChildren[nextIndex];

      if (prevKey === nextKey) {
        // Nove move, create or remove
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
          const nextChildNode = $getNodeByKeyOrThrow(nextKey);
          const collabNode = $createCollabNodeFromLexicalNode(
            binding,
            nextChildNode,
            this,
          );
          collabNodeMap.set(nextKey, collabNode);

          if (prevHasNextKey) {
            this.splice(binding, nextIndex, 1, collabNode);
            prevIndex++;
            nextIndex++;
          } else {
            this.splice(binding, nextIndex, 0, collabNode);
            nextIndex++;
          }
        }
      }
    }

    const appendNewChildren = prevIndex > prevEndIndex;
    const removeOldChildren = nextIndex > nextEndIndex;

    if (appendNewChildren && !removeOldChildren) {
      for (; nextIndex <= nextEndIndex; ++nextIndex) {
        const key = nextChildren[nextIndex];
        const nextChildNode = $getNodeByKeyOrThrow(key);
        const collabNode = $createCollabNodeFromLexicalNode(
          binding,
          nextChildNode,
          this,
        );
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
    collabNode: AnyCollabNode,
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
      
      // After embed insertion, text should go at offset + 1 (YJS style)
      const textOffset = offset + 1;
      xmlText.insert(textOffset, collabNode._text);
    } else if (collabNode instanceof CollabLineBreakNode) {
      xmlText.insertEmbed(offset, collabNode._map);
    } else if (collabNode instanceof CollabDecoratorNode) {
      xmlText.insertEmbed(offset, collabNode._xmlElem);
    }

    this._children.push(collabNode);
  }

  splice(
    binding: Binding,
    index: number,
    delCount: number,
    collabNode?: AnyCollabNode,
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
      xmlText.insertEmbed(offset, collabNode._xmlElem);
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
    collabNode: AnyCollabNode,
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
            const {offset} = getPositionFromElementAndOffset(
              this,
              currIndex,
              true,
            );
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

}

export function $createCollabElementNode(
  xmlText: XmlText,
  parent: null | CollabElementNode,
  type: string,
  explicitKey?: string,
): CollabElementNode {
  const collabNode = new CollabElementNode(xmlText, parent, type);
  
  // If an explicit key is provided, use it instead of letting Lexical generate one
  if (explicitKey) {
    collabNode._key = explicitKey;
  }
  
  (xmlText as any)._collabNode = collabNode;
  return collabNode;
}
