/**
 * Simplified XmlText that extends LoroText with minimal XML-specific functionality
 */

import { LoroText, LoroMap, LoroDoc } from 'loro-crdt';

export interface TextAttributes {
  [key: string]: any;
}

export class XmlText extends LoroText {
  private _attributes: LoroMap;
  private _doc: LoroDoc;

  constructor(doc: LoroDoc, id?: string) {
    // Create the LoroText first
    super();
    
    // Store doc reference and initialize XML-specific attributes map
    this._doc = doc;
    const textId = id || `xml_${Math.random().toString(36).substr(2, 9)}`;
    this._attributes = doc.getMap(`${textId}_attrs`);
  }

  /**
   * Insert an embedded object using a placeholder character
   */
  insertEmbed(offset: number, object: any, attributes?: TextAttributes): void {
    try {
      const currentLength = this.length;
      if (offset < 0 || offset > currentLength) {
        console.warn(`Invalid embed offset ${offset} for text length ${currentLength}, clamping`);
        offset = Math.max(0, Math.min(offset, currentLength));
      }
      
      // Use a placeholder character for embeds
      const placeholderChar = '\uE000';
      
      super.insert(offset, placeholderChar);
      
      // Store embed metadata
      const embedKey = `embed_${offset}_${Date.now()}`;
      this._attributes.set(embedKey, {
        type: 'embed',
        offset: offset,
        object: this._serializeObject(object),
        attributes: attributes || {}
      });
      
    } catch (error) {
      console.error('Error in insertEmbed:', error);
      throw error;
    }
  }

  /**
   * Override insert to add XML-specific functionality
   */
  insert(offset: number, text: string, attributes?: TextAttributes): void {
    super.insert(offset, text);
    
    if (attributes && Object.keys(attributes).length > 0) {
      const attrKey = `format_${offset}_${text.length}_${Date.now()}`;
      this._attributes.set(attrKey, {
        type: 'text_format',
        offset: offset,
        length: text.length,
        attributes: attributes
      });
    }
  }

  /**
   * Serialize object for storage
   */
  private _serializeObject(object: any): any {
    if (object && typeof object === 'object' && object.id) {
      return {
        type: 'loro_ref',
        id: object.id
      };
    }
    return {
      type: 'serialized',
      data: JSON.stringify(object)
    };
  }

  /**
   * YJS compatibility methods
   */
  
  get nextSibling(): XmlText | null {
    return null; // Simplified - no sibling navigation
  }

  get prevSibling(): XmlText | null {
    return null; // Simplified - no sibling navigation
  }

  _copy(): XmlText {
    return new XmlText(this._doc);
  }

  clone(): XmlText {
    const cloned = new XmlText(this._doc);
    cloned.insert(0, this.toString());
    return cloned;
  }

  getAttribute(name: string): unknown {
    return this._attributes.get(name);
  }

  setAttribute(name: string, value: string): void {
    this._attributes.set(name, value);
  }

  getAttributes(): { [key: string]: unknown } {
    const attrs: { [key: string]: unknown } = {};
    for (const key of this._attributes.keys()) {
      attrs[key] = this._attributes.get(key);
    }
    return attrs;
  }

  /**
   * Get plain text content (excluding embedded objects and formatting)
   */
  toPlainString(): string {
    return this.toString();
  }

  /**
   * Apply delta operations (simplified)
   */
  applyDelta(delta: Array<any>): void {
    let offset = 0;
    
    for (const op of delta) {
      if (op.insert !== undefined) {
        if (typeof op.insert === 'string') {
          this.insert(offset, op.insert, op.attributes);
          offset += op.insert.length;
        } else {
          this.insertEmbed(offset, op.insert, op.attributes);
          offset += 1;
        }
      } else if (op.retain !== undefined) {
        offset += op.retain;
      } else if (op.delete !== undefined) {
        this.delete(offset, op.delete);
      }
    }
  }

  /**
   * Get content in YJS-compatible format
   */
  getContent(): { ops: Array<any> } {
    const ops = [];
    const textContent = this.toString();
    
    if (textContent.length > 0) {
      ops.push({ insert: textContent });
    }
    
    return { ops };
  }

  /**
   * Get embed entries for internal use
   */
  getEmbedEntries(): Array<{ key: string; value: any; offset: number }> {
    return Array.from(this._attributes.entries())
      .filter(([key]) => key.startsWith('embed_'))
      .map(([key, value]) => ({ key, value, offset: (value as any).offset }))
      .sort((a, b) => a.offset - b.offset);
  }

  /**
   * Get the document this XmlText belongs to
   */
  getDoc(): LoroDoc {
    return this._doc;
  }

  /**
   * Get the ID of this XmlText instance
   */
  getId(): string {
    // Use the LoroText's ID if available, otherwise generate one
    return this.id || `xml_${Math.random().toString(36).substr(2, 9)}`;
  }


}

/**
 * Factory function to create XmlText
 */
export function createXmlText(doc: LoroDoc, id?: string): XmlText {
  return new XmlText(doc, id);
}