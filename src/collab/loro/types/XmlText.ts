/**
 * LoroXmlText - A YJS XmlText-compatible wrapper around Loro primitives
 * 
 * This class provides the same API as YJS XmlText but uses Loro's LoroList
 * and LoroMap underneath to maintain compatibility with existing code.
 */

import { LoroText, LoroMap, LoroDoc, Cursor } from 'loro-crdt';

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
  private _text: LoroText;
  private _attributes: LoroMap;
  private _doc: LoroDoc;
  private _observers: Array<(event: XmlTextEvent) => void> = [];
  private _item: any = null; // For sibling navigation
  public parent: XmlText | null = null;

  constructor(doc: LoroDoc, id?: string) {
    this._doc = doc;
    try {
      const textId = id || `xml_${Math.random().toString(36).substr(2, 9)}`;
      this._text = doc.getText(textId);
      this._attributes = doc.getMap(`${textId}_attrs`);
      
      // Validate the text was created properly
      this._validateText();
    } catch (error) {
      console.error('Error creating XmlText:', error);
      throw error;
    }
  }

  /**
   * Validate that the Loro text is in a valid state
   */
  private _validateText(): void {
    try {
      // Try to access basic properties to ensure the text is valid
      const length = this._text.length;
      const id = this._text.id;
    } catch (error) {
      console.error('Text validation failed:', error);
      throw new Error('XmlText is in invalid state: ' + error.message);
    }
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
    
    try {
      // Get current length safely
      const currentLength = this._text.length;
      
      // Validate and clamp offset
      if (offset < 0 || offset > currentLength) {
        console.warn(`Invalid offset ${offset} for text length ${currentLength}, clamping`);
        offset = Math.max(0, Math.min(offset, currentLength));
      }
      
      // LoroText.insert(pos, content) - attributes handled separately
      this._text.insert(offset, text);
      // If we have attributes, store them in the attributes map
      if (attributes && Object.keys(attributes).length > 0) {
        const attrKey = `format_${offset}_${text.length}_${Date.now()}`;
        this._attributes.set(attrKey, {
          type: 'text_format',
          offset: offset,
          length: text.length,
          attributes: attributes
        });
      }
      // Commit the transaction to trigger Loro's event system
      try {
        this._doc.commit();
      } catch (error) {
        console.error(`[XmlText] ERROR during commit:`, error);
      }
      
      this._notifyObservers({
        delta: [{ retain: offset }, { insert: text, attributes }],
        target: this,
        transaction: null
      });
      
    } catch (error) {
      console.error('Error inserting text into LoroText:', error);
      console.error('Text:', text, 'Offset:', offset);
      console.error('Attributes:', attributes);
      throw error;
    }
  }

  /**
   * Insert an embedded object at the specified offset
   * 
   * LoroText doesn't directly support embedded objects like Y.js XmlText,
   * so we use a placeholder character approach combined with metadata storage
   */
  insertEmbed(offset: number, object: any, attributes?: TextAttributes): void {
    try {
      // Validate offset
      const currentLength = this._text.length;
      if (offset < 0 || offset > currentLength) {
        console.warn(`Invalid embed offset ${offset} for text length ${currentLength}, clamping`);
        offset = Math.max(0, Math.min(offset, currentLength));
      }
      
      // Create a unique placeholder character for the embedded object
      // Using Unicode Private Use Area characters that won't appear in normal text
      const embedId = Math.random().toString(36).substr(2, 9);
      const placeholderChar = '\uE000'; // Private Use Area start
      
      // Insert the placeholder character into the text
      this._text.insert(offset, placeholderChar);
      
      // Store the embedded object metadata in the attributes map
      const embedKey = `embed_${offset}_${embedId}`;
      const embedData = {
        type: 'embed',
        id: embedId,
        offset: offset,
        placeholder: placeholderChar,
        object: this._serializeObject(object),
        attributes: attributes || {},
        timestamp: Date.now()
      };
      
      this._attributes.set(embedKey, embedData);
      
      // Notify observers
      this._notifyObservers({
        delta: [{ retain: offset }, { insert: object, attributes }],
        target: this,
        transaction: null
      });
      
    } catch (error) {
      console.error('Error in insertEmbed:', error);
      console.error('Offset:', offset, 'Object:', object);
      throw error;
    }
  }

  /**
   * Serialize an object for storage in LoroMap
   */
  private _serializeObject(object: any): any {
    if (object instanceof XmlText) {
      return {
        type: 'xmltext_ref',
        id: object._text.id,
        textId: object._text.id
      };
    } else if (object && typeof object === 'object' && object.id) {
      return {
        type: 'loro_ref',
        id: object.id,
        refType: object.constructor?.name || 'unknown'
      };
    } else if (typeof object === 'string' || typeof object === 'number' || typeof object === 'boolean') {
      return {
        type: 'primitive',
        value: object
      };
    } else if (object === null || object === undefined) {
      return {
        type: 'null',
        value: null
      };
    } else {
      try {
        return {
          type: 'serialized',
          data: JSON.stringify(object),
          originalType: object.constructor?.name || 'unknown'
        };
      } catch (serializationError) {
        console.warn('Failed to serialize object for embed:', serializationError);
        return {
          type: 'placeholder',
          id: Math.random().toString(36).substr(2, 9),
          originalType: object.constructor?.name || 'unknown'
        };
      }
    }
  }

  /**
   * Apply formatting to a range of text
   */
  format(index: number, length: number, attributes: TextAttributes): void {
    if (length === 0) {
      return;
    }

    // Store formatting information in the attributes map
    // LoroText doesn't support character-level formatting like Y.js
    const formatKey = `format_${index}_${length}_${Date.now()}`;
    this._attributes.set(formatKey, {
      type: 'text_format',
      index: index,
      length: length,
      attributes: { ...attributes }
    });
    
    this._notifyObservers({
      delta: [{ retain: index }, { retain: length, attributes }],
      target: this,
      transaction: null
    });
  }  /**
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
    
    // LoroText.delete(pos, len)
    const textLength = this._text.length;
    if (offset >= 0 && offset < textLength) {
      const actualLength = Math.min(length, textLength - offset);
      this._text.delete(offset, actualLength);
      // MANUAL FIX: Trigger document update after deletion
      try {
        const update = this._doc.export({ mode: 'update' });
        if (update.length > 0) {
          ;(globalThis as any).__loroDocumentUpdateHandler?.(update, null);
        }
      } catch (error) {
        console.error(`[XmlText] Error exporting document update after delete:`, error);
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
    // LoroText.length gives us the character count directly
    return this._text.length;
  }

  /**
   * Convert the current state to delta format
   */
  toDelta(): Delta[] {
    const deltas: Delta[] = [];
    // For LoroText, we'll create a simple delta with the text content
    const textContent = this._text.toString();
    
    // Process text content and embedded objects
    let offset = 0;
    const textLength = textContent.length;
    
    // Get all embed entries and sort by offset
    const embedEntries = Array.from(this._attributes.entries())
      .filter(([key]) => key.startsWith('embed_'))
      .map(([key, value]) => ({ key, value, offset: (value as any).offset }))
      .sort((a, b) => a.offset - b.offset);
    
    for (const embedEntry of embedEntries) {
      const embedData = embedEntry.value as any;
      const embedOffset = embedData.offset;
      
      // Add text content before this embed
      if (embedOffset > offset) {
        const textBefore = textContent.slice(offset, embedOffset);
        if (textBefore.length > 0) {
          deltas.push({
            insert: textBefore
          });
        }
      }
      
      // Add the embedded object
      if (embedData.object && embedData.object.textId) {
        // This is an embedded XmlText object (paragraph)
        deltas.push({
          insert: embedData.object,
          attributes: embedData.attributes
        });
      }
      
      // Skip the placeholder character
      offset = embedOffset + 1;
    }
    
    // Add remaining text content after all embeds
    if (offset < textLength) {
      const remainingText = textContent.slice(offset);
      if (remainingText.length > 0) {
        deltas.push({
          insert: remainingText
        });
      }
    }
    
    // If no embeds, just add the text content
    if (embedEntries.length === 0 && textContent.length > 0) {
      deltas.push({
        insert: textContent
      });
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
   * Get the ID/textId of this XmlText instance
   */
  getId(): string {
    // Extract the ID from the text container ID
    return this._text.id;
  }

  /**
   * Get all embed entries (for internal use by CollabElementNode)
   */
  getEmbedEntries(): Array<{ key: string; value: any; offset: number }> {
    return Array.from(this._attributes.entries())
      .filter(([key]) => key.startsWith('embed_'))
      .map(([key, value]) => ({ key, value, offset: (value as any).offset }))
      .sort((a, b) => a.offset - b.offset);
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
    // LoroText.toString() gives us the plain text content
    const content = this._text.toString();
    return content;
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
   * Get the underlying LoroText for advanced operations
   */
  getLoroText(): LoroText {
    return this._text;
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
    
    // Subscribe to text changes
    const unsubscribeText = this._text.subscribe(() => {
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
      unsubscribeText();
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
   * Get the character at a specific index
   */
  get(index: number): string {
    const text = this._text.toString();
    return text[index] || '';
  }

  /**
   * Get a range of characters
   */
  slice(start?: number, end?: number): string {
    const text = this._text.toString();
    return text.slice(start, end);
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
      // For LoroText, we can create cursors based on text positions
      const textLength = this._text.length;
      if (pos < 0 || pos > textLength) {
        return null;
      }
      
      // Create a cursor using the underlying text structure
      return this._text.getCursor(Math.min(pos, textLength), side || 0);
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
    // Check if we have any formatting attributes stored
    const attrKeys = Array.from(this._attributes.keys());
    return attrKeys.some(key => key.startsWith('format_'));
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
