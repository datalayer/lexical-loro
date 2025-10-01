/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { $createTextNode, $createParagraphNode, $isTextNode, $isElementNode, createEditor, $getRoot } from 'lexical';
import { LexicalNodeData, LexicalNodeDataHelper } from '../src/collab/loro/types/LexicalNodeData';

describe('LexicalNodeData', () => {
  test('should serialize and deserialize TextNode', () => {
    const editor = createEditor();
    
    editor.update(() => {
      const textNode = $createTextNode('Hello World');
      textNode.setFormat(1); // Bold format
      $getRoot().append(textNode);
      
      const nodeData: LexicalNodeData = { lexicalNode: textNode };
      const serialized = LexicalNodeDataHelper.serialize(nodeData);
      
      expect(typeof serialized).toBe('string');
      
      const deserialized = LexicalNodeDataHelper.deserialize(serialized);
      
      expect(deserialized).not.toBeNull();
      expect(deserialized!.lexicalNode.getType()).toBe('text');
      
      const deserializedTextNode = deserialized!.lexicalNode;
      if ($isTextNode(deserializedTextNode)) {
        expect(deserializedTextNode.getTextContent()).toBe('Hello World');
        expect(deserializedTextNode.getFormat()).toBe(1);
      }
    });
  });

  test('should serialize and deserialize ParagraphNode', () => {
    const editor = createEditor();
    
    editor.update(() => {
      const paragraphNode = $createParagraphNode();
      $getRoot().append(paragraphNode);
      
      const nodeData: LexicalNodeData = { lexicalNode: paragraphNode };
      const serialized = LexicalNodeDataHelper.serialize(nodeData);
      
      expect(typeof serialized).toBe('string');
      
      const deserialized = LexicalNodeDataHelper.deserialize(serialized);
      
      expect(deserialized).not.toBeNull();
      expect(deserialized!.lexicalNode.getType()).toBe('paragraph');
      
      const deserializedElementNode = deserialized!.lexicalNode;
      if ($isElementNode(deserializedElementNode)) {
        expect(deserializedElementNode.getType()).toBe('paragraph');
      }
    });
  });

  test('should handle serialization errors gracefully', () => {
    // Create a mock node that will fail serialization but still return a fallback
    const mockNode = {
      getType: () => 'mock',
      getKey: () => 'mock-key-123',
      exportJSON: () => {
        throw new Error('Serialization failed');
      }
    } as any;

    const nodeData: LexicalNodeData = { lexicalNode: mockNode };
    
    // Should not throw, but return a fallback serialization
    const result = LexicalNodeDataHelper.serialize(nodeData);
    expect(typeof result).toBe('string');
    
    const parsed = JSON.parse(result);
    expect(parsed.lexicalNode.type).toBe('mock');
    expect(parsed.lexicalNode.key).toBe('mock-key-123');
  });

  test('should handle deserialization errors gracefully', () => {
    const invalidJSON = '{"invalid": "data"}';
    
    // Should return null for invalid data, not throw
    const result = LexicalNodeDataHelper.deserialize(invalidJSON);
    expect(result).toBeNull();
  });
});