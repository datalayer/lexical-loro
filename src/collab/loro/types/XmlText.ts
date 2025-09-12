/**
 * LoroXmlText - A YJS XmlText-compatible wrapper around Loro primitives
 * 
 * This class provides the same API as YJS XmlText but uses Loro's LoroList
 * and LoroMap underneath to maintain compatibility with existing code.
 */

import { LoroList, LoroMap, LoroDoc, Cursor } from 'loro-crdt';

export interface EmbedObject {
  type: 'embed';
  object: any;
  id: string;
}

export interface Delta {
  insert?: string | object;
  delete?: number;
  retain?: number;
  attributes?: { [key: string]: unknown };
}

export interface TextAttributes {
  [key: string]: any;
}

export interface XmlTextEvent {
  delta: Delta[];
  target: XmlText;
  transaction: any;
}

export class XmlText {
  private _list: LoroList;
  private _attributes: LoroMap;
  private _doc: LoroDoc;
  private _observers: Array<(event: XmlTextEvent) => void> = [];
  private _item: any = null; // For sibling navigation
  public parent: XmlText | null = null;

  constructor(doc: LoroDoc, id?: string) {
    this._doc = doc;
    this._list = doc.getList(id || `xml_${Math.random().toString(36).substr(2, 9)}`);
    this._attributes = doc.getMap(`${this._list.id}_attrs`);
  }

  /**
   * Get the next sibling XmlText node
   */
  get nextSibling(): XmlText | null {
    // In a full implementation, this would traverse the document structure
    // For now, return null as we don't have a complete document tree
    return null;
  }

  /**
   * Get the previous sibling XmlText node
   */
  get prevSibling(): XmlText | null {
    // In a full implementation, this would traverse the document structure
    // For now, return null as we don't have a complete document tree
    return null;
  }

  /**
   * Insert text at the specified offset with optional attributes
   */
  insert(offset: number, text: string, attributes?: TextAttributes): void {
    if (text.length <= 0) {
      return;
    }
    
    // Store character with attributes if provided
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (attributes && Object.keys(attributes).length > 0) {
        // Store character with formatting information
        const formattedChar = {
          char,
          attributes: { ...attributes }
        };
        this._list.insert(offset + i, formattedChar);
      } else {
        this._list.insert(offset + i, char);
      }
    }
    
    this._notifyObservers({
      delta: [{ retain: offset }, { insert: text, attributes }],
      target: this,
      transaction: null
    });
  }

  /**
   * Insert an embedded object at the specified offset
   */
  insertEmbed(offset: number, object: any, attributes?: TextAttributes): void {
    // Create a reference object to store the embedded item
    const embed: EmbedObject = {
      type: 'embed',
      object: object,
      id: Math.random().toString(36).substr(2, 9)
    };
    
    if (attributes && Object.keys(attributes).length > 0) {
      (embed as any).attributes = { ...attributes };
    }
    
    this._list.insert(offset, embed);
    
    this._notifyObservers({
      delta: [{ retain: offset }, { insert: object, attributes }],
      target: this,
      transaction: null
    });
  }

  /**
   * Apply formatting to a range of text
   */
  format(index: number, length: number, attributes: TextAttributes): void {
    if (length === 0) {
      return;
    }

    const items = this._list.toArray();
    for (let i = index; i < Math.min(index + length, items.length); i++) {
      const item = items[i];
      if (typeof item === 'string') {
        // Convert string to formatted object
        this._list.delete(i, 1);
        this._list.insert(i, {
          char: item,
          attributes: { ...attributes }
        });
      } else if (item && typeof item === 'object') {
        // Merge attributes with existing formatted object
        const existingAttrs = (item as any).attributes || {};
        const newAttrs = { ...existingAttrs, ...attributes };
        
        // Remove null/undefined attributes (YJS style)
        Object.keys(newAttrs).forEach(key => {
          if (newAttrs[key] === null || newAttrs[key] === undefined) {
            delete newAttrs[key];
          }
        });
        
        this._list.delete(i, 1);
        if ((item as any).char !== undefined) {
          this._list.insert(i, {
            char: (item as any).char,
            attributes: newAttrs
          });
        } else {
          // Embed object
          this._list.insert(i, {
            ...item,
            attributes: newAttrs
          });
        }
      }
    }

    this._notifyObservers({
      delta: [{ retain: index }, { retain: length, attributes }],
      target: this,
      transaction: null
    });
  }

  /**
   * Apply delta operations (Quill-style)
   */
  applyDelta(delta: Delta[]): void {
    let offset = 0;
    
    for (const op of delta) {
      if (op.retain !== undefined) {
        offset += op.retain;
        if (op.attributes) {
          this.format(offset - op.retain, op.retain, op.attributes);
        }
      } else if (op.insert !== undefined) {
        if (typeof op.insert === 'string') {
          this.insert(offset, op.insert, op.attributes);
          offset += op.insert.length;
        } else {
          this.insertEmbed(offset, op.insert, op.attributes);
          offset += 1;
        }
      } else if (op.delete !== undefined) {
        this.delete(offset, op.delete);
      }
    }
  }

  /**
   * Delete content at the specified offset
   */
  delete(offset: number, length: number): void {
    if (length === 0) {
      return;
    }
    
    for (let i = 0; i < length; i++) {
      if (offset < this._list.length) {
        this._list.delete(offset, 1);
      }
    }
    
    this._notifyObservers({
      delta: [{ retain: offset }, { delete: length }],
      target: this,
      transaction: null
    });
  }

  /**
   * Get the current length of the content (YJS compatible)
   */
  get length(): number {
    // Count actual characters, not list items
    const items = this._list.toArray();
    let count = 0;
    for (const item of items) {
      if (typeof item === 'string') {
        count += 1;
      } else if (item && typeof item === 'object') {
        if ((item as any).char !== undefined) {
          count += 1; // Formatted character
        } else if ((item as EmbedObject).type === 'embed') {
          count += 1; // Embedded object counts as 1
        } else {
          count += 1; // Other objects
        }
      }
    }
    return count;
  }

  /**
   * Convert the current state to delta format
   */
  toDelta(): Delta[] {
    const deltas: Delta[] = [];
    const items = this._list.toArray();
    
    let currentText = '';
    let currentAttributes: TextAttributes | undefined;
    
    for (const item of items) {
      if (typeof item === 'string') {
        if (currentAttributes) {
          // Flush previous formatted text
          if (currentText) {
            deltas.push({ insert: currentText, attributes: currentAttributes });
            currentText = '';
          }
          currentAttributes = undefined;
        }
        currentText += item;
      } else if (item && typeof item === 'object') {
        const itemObj = item as any;
        
        if (itemObj.type === 'embed') {
          // Flush any accumulated text
          if (currentText) {
            deltas.push({ insert: currentText, attributes: currentAttributes });
            currentText = '';
          }
          
          // Add the embedded object
          const embedObj = itemObj as EmbedObject;
          const embedDelta: Delta = { insert: embedObj.object };
          if (itemObj.attributes) {
            embedDelta.attributes = itemObj.attributes;
          }
          deltas.push(embedDelta);
          currentAttributes = undefined;
        } else if (itemObj.char !== undefined) {
          // Formatted character
          const newAttrs = itemObj.attributes;
          
          // Check if attributes changed
          if (JSON.stringify(currentAttributes) !== JSON.stringify(newAttrs)) {
            // Flush previous text with old attributes
            if (currentText) {
              deltas.push({ insert: currentText, attributes: currentAttributes });
              currentText = '';
            }
            currentAttributes = newAttrs;
          }
          
          currentText += itemObj.char;
        } else {
          // Other object type
          if (currentText) {
            deltas.push({ insert: currentText, attributes: currentAttributes });
            currentText = '';
          }
          deltas.push({ insert: item });
          currentAttributes = undefined;
        }
      }
    }
    
    // Flush any remaining text
    if (currentText) {
      deltas.push({ insert: currentText, attributes: currentAttributes });
    }
    
    return deltas;
  }

  /**
   * Get content in YJS-compatible format (same as toDelta for XmlText)
   */
  getContent(): { ops: Delta[] } {
    return { ops: this.toDelta() };
  }

  /**
   * Get an attribute value
   */
  getAttribute(name: string): unknown {
    return this._attributes.get(name);
  }

  /**
   * Set an attribute value
   */
  setAttribute(name: string, value: string): void {
    this._attributes.set(name, value);
  }

  /**
   * Get all attributes as an object
   */
  getAttributes(): { [key: string]: unknown } {
    const attrs: { [key: string]: unknown } = {};
    for (const key of this._attributes.keys()) {
      attrs[key] = this._attributes.get(key);
    }
    return attrs;
  }

  /**
   * Get the text content with XML-like formatting (YXmlText compatible)
   */
  toString(): string {
    const deltas = this.toDelta();
    return deltas.map(delta => {
      if (typeof delta.insert === 'string') {
        if (delta.attributes) {
          // Build nested XML tags for attributes
          const nestedNodes: Array<{ nodeName: string; attrs: Array<{ key: string; value: any }> }> = [];
          
          for (const nodeName in delta.attributes) {
            const attrs: Array<{ key: string; value: any }> = [];
            const attrValue = delta.attributes[nodeName];
            
            if (typeof attrValue === 'object' && attrValue !== null) {
              for (const key in attrValue) {
                attrs.push({ key, value: attrValue[key] });
              }
            } else {
              attrs.push({ key: 'value', value: attrValue });
            }
            
            // Sort attributes to get a unique order
            attrs.sort((a, b) => a.key < b.key ? -1 : 1);
            nestedNodes.push({ nodeName, attrs });
          }
          
          // Sort node order to get a unique order
          nestedNodes.sort((a, b) => a.nodeName < b.nodeName ? -1 : 1);
          
          // Convert to XML string
          let str = '';
          for (let i = 0; i < nestedNodes.length; i++) {
            const node = nestedNodes[i];
            str += `<${node.nodeName}`;
            for (let j = 0; j < node.attrs.length; j++) {
              const attr = node.attrs[j];
              str += ` ${attr.key}="${attr.value}"`;
            }
            str += '>';
          }
          str += delta.insert;
          for (let i = nestedNodes.length - 1; i >= 0; i--) {
            str += `</${nestedNodes[i].nodeName}>`;
          }
          return str;
        }
        return delta.insert;
      }
      return ''; // Ignore embedded objects in toString()
    }).join('');
  }

  /**
   * Get plain text content only (excluding embedded objects and formatting)
   */
  toPlainString(): string {
    const items = this._list.toArray();
    return items
      .map(item => {
        if (typeof item === 'string') {
          return item;
        } else if (item && typeof item === 'object' && (item as any).char) {
          return (item as any).char;
        }
        return '';
      })
      .join('');
  }

  /**
   * Clone this XmlText (YJS compatible)
   */
  clone(): XmlText {
    const cloned = new XmlText(this._doc);
    
    // Apply delta to properly clone content with formatting
    const delta = this.toDelta();
    cloned.applyDelta(delta);
    
    // Copy attributes
    for (const key of this._attributes.keys()) {
      cloned.setAttribute(key, this._attributes.get(key) as string);
    }
    
    return cloned;
  }

  /**
   * Get the underlying LoroList for advanced operations
   */
  getLoroList(): LoroList {
    return this._list;
  }

  /**
   * Get the underlying LoroMap for attributes
   */
  getLoroMap(): LoroMap {
    return this._attributes;
  }

  /**
   * Observe changes to this XmlText (YJS compatible)
   */
  observe(callback: (event: XmlTextEvent) => void): () => void {
    this._observers.push(callback);
    
    // Subscribe to list changes
    const unsubscribeList = this._list.subscribe(() => {
      // Convert to YJS-style event format
      const event: XmlTextEvent = {
        delta: this.toDelta(),
        target: this,
        transaction: null
      };
      this._notifyObservers(event);
    });
    
    const unsubscribeAttrs = this._attributes.subscribe(() => {
      const event: XmlTextEvent = {
        delta: this.toDelta(),
        target: this,
        transaction: null
      };
      this._notifyObservers(event);
    });
    
    // Return unsubscribe function
    return () => {
      const index = this._observers.indexOf(callback);
      if (index > -1) {
        this._observers.splice(index, 1);
      }
      unsubscribeList();
      unsubscribeAttrs();
    };
  }

  /**
   * Internal method to notify observers
   */
  private _notifyObservers(event: XmlTextEvent): void {
    for (const observer of this._observers) {
      try {
        observer(event);
      } catch (error) {
        console.error('Error in XmlText observer:', error);
      }
    }
  }

  /**
   * Convert to JSON (YJS compatible)
   */
  toJSON(): string {
    return this.toString();
  }

  /**
   * Create a DOM Text node (YXmlText compatible)
   */
  toDOM(document?: Document, hooks?: any, binding?: any): Text {
    const doc = document || (typeof window !== 'undefined' ? window.document : null);
    if (!doc) {
      throw new Error('Document is required for toDOM() in non-browser environments');
    }
    
    const textNode = doc.createTextNode(this.toPlainString());
    
    if (binding !== undefined && binding._createAssociation) {
      binding._createAssociation(textNode, this);
    }
    
    return textNode;
  }

  /**
   * Remove an attribute (YJS compatible)
   */
  removeAttribute(attributeName: string): void {
    this._attributes.delete(attributeName);
  }

  /**
   * Make a copy that can be included elsewhere (YJS compatible)
   */
  _copy(): XmlText {
    return new XmlText(this._doc);
  }

  /**
   * Get the item at a specific index
   */
  get(index: number): unknown {
    return this._list.get(index);
  }

  /**
   * Get a range of items
   */
  slice(start?: number, end?: number): unknown[] {
    const items = this._list.toArray();
    return items.slice(start, end);
  }

  /**
   * Get the document this LoroXmlText belongs to
   */
  getDoc(): LoroDoc {
    return this._doc;
  }

  /**
   * Create a stable cursor at the specified position
   * This allows tracking positions even as the text changes
   */
  getCursor(pos: number, side?: -1 | 0 | 1): Cursor | null {
    try {
      // Convert position-based access to Loro cursor
      // For LoroXmlText backed by LoroList, we need to create cursors based on list positions
      const textContent = this.toString();
      if (pos < 0 || pos > textContent.length) {
        return null;
      }
      
      // Create a cursor using the underlying list structure
      // Since we store characters individually in the list, position maps directly
      return this._list.getCursor(Math.min(pos, this._list.length), side || 0);
    } catch (error) {
      console.warn('Failed to create cursor:', error);
      return null;
    }
  }

  /**
   * Resolve a cursor to current position
   */
  getCursorPos(cursor: Cursor): { offset: number; side: -1 | 0 | 1 } | null {
    try {
      const result = this._doc.getCursorPos(cursor);
      return {
        offset: result.offset,
        side: result.side
      };
    } catch (error) {
      console.warn('Failed to resolve cursor position:', error);
      return null;
    }
  }

  /**
   * Check if this XmlText has formatting attributes
   */
  get hasFormatting(): boolean {
    const items = this._list.toArray();
    return items.some(item => 
      item && typeof item === 'object' && (item as any).attributes
    );
  }

  /**
   * Get content with deep formatting (YJS getContentDeep compatible)
   */
  getContentDeep(): { ops: Delta[] } {
    // For XmlText, this is the same as getContent since it's already at the leaf level
    return this.getContent();
  }

  /**
   * Write method for YJS compatibility (used in serialization)
   */
  _write(encoder: any): void {
    // In a full implementation, this would write type reference for serialization
    // For now, this is a placeholder
  }
}

/**
 * Factory function to create a new LoroXmlText
 */
export function createXmlText(doc: LoroDoc, id?: string): XmlText {
  return new XmlText(doc, id);
}

/**
 * Create XmlText from decoder (YJS compatibility)
 */
export function readXmlText(decoder: any): XmlText {
  // In a full implementation, this would read from decoder
  // For now, create a new empty XmlText
  throw new Error('readXmlText requires a LoroDoc instance');
}
