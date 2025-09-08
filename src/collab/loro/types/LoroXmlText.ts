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

export class LoroXmlText {
  private _list: LoroList;
  private _attributes: LoroMap;
  private _doc: LoroDoc;
  public parent: LoroXmlText | null = null;

  constructor(doc: LoroDoc, id?: string) {
    this._doc = doc;
    this._list = doc.getList(id || `xml_${Math.random().toString(36).substr(2, 9)}`);
    this._attributes = doc.getMap(`${this._list.id}_attrs`);
  }

  /**
   * Insert text at the specified offset
   */
  insert(offset: number, text: string): void {
    // Split text into individual characters for precise positioning
    for (let i = 0; i < text.length; i++) {
      this._list.insert(offset + i, text[i]);
    }
  }

  /**
   * Insert an embedded object at the specified offset
   */
  insertEmbed(offset: number, object: any): void {
    // Create a reference object to store the embedded item
    const embed: EmbedObject = {
      type: 'embed',
      object: object,
      id: Math.random().toString(36).substr(2, 9)
    };
    this._list.insert(offset, embed);
  }

  /**
   * Delete content at the specified offset
   */
  delete(offset: number, length: number): void {
    for (let i = 0; i < length; i++) {
      if (offset < this._list.length) {
        this._list.delete(offset, 1);
      }
    }
  }

  /**
   * Get the current length of the content
   */
  get length(): number {
    return this._list.length;
  }

  /**
   * Convert the current state to delta format
   */
  toDelta(): Delta[] {
    const deltas: Delta[] = [];
    const items = this._list.toArray();
    
    let currentText = '';
    
    for (const item of items) {
      if (typeof item === 'string') {
        currentText += item;
      } else {
        // Flush any accumulated text
        if (currentText) {
          deltas.push({ insert: currentText });
          currentText = '';
        }
        
        // Add the embedded object
        if (item && typeof item === 'object' && (item as EmbedObject).type === 'embed') {
          const embedObj = item as EmbedObject;
          deltas.push({ insert: embedObj.object });
        } else {
          deltas.push({ insert: item as string | object });
        }
      }
    }
    
    // Flush any remaining text
    if (currentText) {
      deltas.push({ insert: currentText });
    }
    
    return deltas;
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
   * Get the text content only (excluding embedded objects)
   */
  toString(): string {
    const items = this._list.toArray();
    return items
      .filter(item => typeof item === 'string')
      .join('');
  }

  /**
   * Clone this XmlText
   */
  clone(): LoroXmlText {
    const cloned = new LoroXmlText(this._doc);
    // Copy the content
    const items = this._list.toArray();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (typeof item === 'string') {
        cloned.insert(i, item);
      } else {
        cloned.insertEmbed(i, item);
      }
    }
    
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
   * Observe changes to this XmlText
   */
  observe(callback: (event: any) => void): () => void {
    // Subscribe to list changes
    const unsubscribeList = this._list.subscribe(callback);
    const unsubscribeAttrs = this._attributes.subscribe(callback);
    
    // Return unsubscribe function
    return () => {
      unsubscribeList();
      unsubscribeAttrs();
    };
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
}

/**
 * Factory function to create a new LoroXmlText
 */
export function createLoroXmlText(doc: LoroDoc, id?: string): LoroXmlText {
  return new LoroXmlText(doc, id);
}
