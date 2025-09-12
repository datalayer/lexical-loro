/**
 * Test suite for Enhanced XmlText - demonstrating YXmlText compatibility
 */

import { LoroDoc } from 'loro-crdt';
import { XmlText, createXmlText } from '../src/collab/loro/types/XmlText';

describe('Enhanced XmlText - YXmlText Compatibility', () => {
  let doc: LoroDoc;
  let xmlText: XmlText;

  beforeEach(() => {
    doc = new LoroDoc();
    xmlText = createXmlText(doc);
  });

  describe('Basic Text Operations (YText compatible)', () => {
    test('insert text with attributes', () => {
      xmlText.insert(0, 'Hello', { bold: true });
      xmlText.insert(5, ' World', { italic: true });
      
      expect(xmlText.length).toBe(11);
      expect(xmlText.toPlainString()).toBe('Hello World');
    });

    test('delete text', () => {
      xmlText.insert(0, 'Hello World');
      xmlText.delete(5, 6); // Remove ' World'
      
      expect(xmlText.length).toBe(5);
      expect(xmlText.toPlainString()).toBe('Hello');
    });

    test('format text ranges', () => {
      xmlText.insert(0, 'Hello World');
      xmlText.format(0, 5, { bold: true });
      xmlText.format(6, 5, { italic: true });
      
      const delta = xmlText.toDelta();
      expect(delta).toEqual([
        { insert: 'Hello', attributes: { bold: true } },
        { insert: ' ' },
        { insert: 'World', attributes: { italic: true } }
      ]);
    });

    test('insertEmbed with attributes', () => {
      const embedObj = { type: 'image', src: 'test.jpg' };
      xmlText.insertEmbed(0, embedObj, { width: '100px' });
      
      expect(xmlText.length).toBe(1);
      const delta = xmlText.toDelta();
      expect(delta[0].insert).toEqual(embedObj);
      expect(delta[0].attributes).toEqual({ width: '100px' });
    });
  });

  describe('Delta Operations (Quill compatible)', () => {
    test('applyDelta with mixed operations', () => {
      const delta = [
        { insert: 'Hello ', attributes: { bold: true } },
        { insert: 'Beautiful ' },
        { insert: 'World', attributes: { italic: true, color: 'blue' } }
      ];
      
      xmlText.applyDelta(delta);
      
      expect(xmlText.toPlainString()).toBe('Hello Beautiful World');
      const resultDelta = xmlText.toDelta();
      expect(resultDelta).toEqual(delta);
    });

    test('applyDelta with retain and format', () => {
      xmlText.insert(0, 'Hello World');
      
      const delta = [
        { retain: 6 },
        { retain: 5, attributes: { bold: true } }
      ];
      
      xmlText.applyDelta(delta);
      
      const resultDelta = xmlText.toDelta();
      expect(resultDelta).toEqual([
        { insert: 'Hello ' },
        { insert: 'World', attributes: { bold: true } }
      ]);
    });

    test('applyDelta with delete operation', () => {
      xmlText.insert(0, 'Hello Beautiful World');
      
      const delta = [
        { retain: 6 },
        { delete: 10 }, // Remove 'Beautiful '
      ];
      
      xmlText.applyDelta(delta);
      
      expect(xmlText.toPlainString()).toBe('Hello World');
    });
  });

  describe('YXmlText Specific Features', () => {
    test('toString with XML formatting', () => {
      xmlText.insert(0, 'Hello', { bold: true });
      xmlText.insert(5, ' World', { italic: true });
      
      const xmlString = xmlText.toString();
      
      // Should contain XML-like formatting
      expect(xmlString).toContain('<bold');
      expect(xmlString).toContain('<italic');
      expect(xmlString).toContain('</bold>');
      expect(xmlString).toContain('</italic>');
    });

    test('toDOM creates DOM Text node', () => {
      xmlText.insert(0, 'Hello World');
      
      // Create a mock document
      const mockDocument = {
        createTextNode: jest.fn().mockReturnValue({ nodeType: 3, textContent: 'Hello World' })
      };
      
      const domNode = xmlText.toDOM(mockDocument as any);
      
      expect(mockDocument.createTextNode).toHaveBeenCalledWith('Hello World');
      expect(domNode.textContent).toBe('Hello World');
    });

    test('clone preserves content and formatting', () => {
      xmlText.insert(0, 'Hello', { bold: true });
      xmlText.insert(5, ' World', { italic: true });
      xmlText.setAttribute('title', 'Test Title');
      
      const cloned = xmlText.clone();
      
      expect(cloned.toPlainString()).toBe('Hello World');
      expect(cloned.toDelta()).toEqual(xmlText.toDelta());
      expect(cloned.getAttribute('title')).toBe('Test Title');
    });

    test('observe events on changes', (done) => {
      const observer = jest.fn((event) => {
        expect(event.target).toBe(xmlText);
        expect(event.delta).toBeDefined();
        done();
      });
      
      xmlText.observe(observer);
      xmlText.insert(0, 'Test');
    });
  });

  describe('Attribute Management', () => {
    test('setAttribute and getAttribute', () => {
      xmlText.setAttribute('title', 'My Title');
      xmlText.setAttribute('lang', 'en');
      
      expect(xmlText.getAttribute('title')).toBe('My Title');
      expect(xmlText.getAttribute('lang')).toBe('en');
    });

    test('getAttributes returns all attributes', () => {
      xmlText.setAttribute('title', 'My Title');
      xmlText.setAttribute('lang', 'en');
      
      const attrs = xmlText.getAttributes();
      expect(attrs).toEqual({
        title: 'My Title',
        lang: 'en'
      });
    });

    test('removeAttribute', () => {
      xmlText.setAttribute('title', 'My Title');
      xmlText.removeAttribute('title');
      
      expect(xmlText.getAttribute('title')).toBeUndefined();
    });
  });

  describe('Advanced Features', () => {
    test('hasFormatting property', () => {
      expect(xmlText.hasFormatting).toBe(false);
      
      xmlText.insert(0, 'Hello', { bold: true });
      expect(xmlText.hasFormatting).toBe(true);
    });

    test('getContent returns YJS-compatible format', () => {
      xmlText.insert(0, 'Hello', { bold: true });
      
      const content = xmlText.getContent();
      expect(content).toHaveProperty('ops');
      expect(content.ops).toEqual([
        { insert: 'Hello', attributes: { bold: true } }
      ]);
    });

    test('getContentDeep returns same as getContent for XmlText', () => {
      xmlText.insert(0, 'Hello', { bold: true });
      
      const content = xmlText.getContent();
      const deepContent = xmlText.getContentDeep();
      
      expect(deepContent).toEqual(content);
    });

    test('cursor operations', () => {
      xmlText.insert(0, 'Hello World');
      
      const cursor = xmlText.getCursor(5);
      expect(cursor).toBeDefined();
      
      if (cursor) {
        const pos = xmlText.getCursorPos(cursor);
        expect(pos).toBeTruthy();
      }
    });
  });

  describe('Edge Cases', () => {
    test('empty operations do nothing', () => {
      xmlText.insert(0, ''); // Empty string
      xmlText.delete(0, 0); // Zero length delete
      xmlText.format(0, 0, { bold: true }); // Zero length format
      
      expect(xmlText.length).toBe(0);
      expect(xmlText.toDelta()).toEqual([]);
    });

    test('complex nested formatting', () => {
      xmlText.insert(0, 'Hello World');
      xmlText.format(0, 5, { bold: true });
      xmlText.format(2, 3, { italic: true }); // Overlapping format
      
      const delta = xmlText.toDelta();
      // Should handle overlapping formats correctly
      expect(delta.length).toBeGreaterThan(0);
    });

    test('toJSON returns string representation', () => {
      xmlText.insert(0, 'Hello', { bold: true });
      
      const json = xmlText.toJSON();
      expect(typeof json).toBe('string');
      expect(json).toContain('Hello');
    });
  });
});
