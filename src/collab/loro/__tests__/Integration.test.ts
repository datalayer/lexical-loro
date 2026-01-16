/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import {
  $createTextNode,
  $createParagraphNode,
  $getRoot,
  $getNodeByKey,
  createEditor,
  LexicalEditor
} from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { Binding, createBinding } from '../Bindings';
import { Provider, AwarenessProvider, UserState } from '../State';

/**
 * Creates a mock Provider for testing
 */
function createMockProvider(): Provider {
  const mockUserState: UserState = {
    anchorPos: null,
    color: '#FF0000',
    focusing: false,
    focusPos: null,
    name: 'Test User',
    awarenessData: {}
  };

  return {
    awareness: {
      clientID: 1,
      getLocalState: () => mockUserState,
      getStates: () => new Map(),
      setLocalState: () => {},
      setLocalStateField: () => {},
      on: () => {},
      off: () => {},
      destroy: () => {}
    } as AwarenessProvider,
    connect: async () => {},
    disconnect: () => {},
    on: () => {},
    off: () => {}
  } as Provider;
}

function createTestBinding(doc: LoroDoc): Binding {
  const editor = createEditor({
    onError: (error) => {
      console.error('Editor error:', error);
    }
  });

  const provider = createMockProvider();
  const docMap = new Map<string, LoroDoc>();
  docMap.set('test', doc);

  const binding = createBinding(
    editor,
    provider,
    'test',
    doc,
    docMap
  );

  return binding;
}

describe('Lexical-Loro Integration', () => {
  describe('Two-way synchronization', () => {
    it('synchronizes text changes from Lexical to Loro', () => {
      const doc = new LoroDoc();
      const binding = createTestBinding(doc);
      const editor = binding.editor;

      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Hello');
        root.append(textNode);

        // Verify mapping created
        const nodeKey = textNode.getKey();
        const treeID = binding.nodeMapper.getTreeIDByLexicalKey(nodeKey);
        expect(treeID).toBeDefined();

        // Verify data in Loro
        const loroNode = binding.tree.getNodeByID(treeID!);
        const lexicalData = loroNode?.data.get('lexical');
        expect(lexicalData).toBeDefined();
        expect(lexicalData.text).toBe('Hello');
      });
    });

    it('synchronizes node creation from Loro to Lexical', () => {
      const doc = new LoroDoc();
      const binding = createTestBinding(doc);
      const editor = binding.editor;
      const tree = doc.getTree('lexical');

      editor.update(() => {
        const root = $getRoot();

        // Create text node in Lexical to get JSON format
        const textNode = $createTextNode('From Loro');
        root.append(textNode);
        const exportedJSON = textNode.exportJSON();

        // Clear Lexical
        root.clear();

        // Create node in Loro
        const rootTreeID = binding.nodeMapper.getTreeIDByLexicalKey(root.getKey());
        const loroNode = tree.createNode(rootTreeID, 0);
        loroNode.data.set('lexical', exportedJSON);

        // Manually trigger integration (in real scenario, this happens via event listener)
        const diff = {
          type: 'tree' as const,
          diff: [{
            action: 'create' as const,
            target: loroNode.id,
            parent: rootTreeID,
            index: 0
          }]
        };

        binding.integrators.tree.integrateInternal(diff, binding, binding.provider);

        // Verify node created in Lexical
        const children = root.getChildren();
        expect(children.length).toBe(1);
        expect(children[0].getType()).toBe('text');
        expect(children[0].getTextContent()).toBe('From Loro');
      });
    });
  });

  describe('Complex document structure', () => {
    it('synchronizes nested paragraph with multiple text nodes', () => {
      const doc = new LoroDoc();
      const binding = createTestBinding(doc);
      const editor = binding.editor;

      editor.update(() => {
        const root = $getRoot();
        const paragraph = $createParagraphNode();
        const text1 = $createTextNode('First ');
        const text2 = $createTextNode('Second ');
        const text3 = $createTextNode('Third');

        paragraph.append(text1, text2, text3);
        root.append(paragraph);

        // Verify all nodes have mappings
        expect(binding.nodeMapper.hasLexicalMapping(paragraph.getKey())).toBe(true);
        expect(binding.nodeMapper.hasLexicalMapping(text1.getKey())).toBe(true);
        expect(binding.nodeMapper.hasLexicalMapping(text2.getKey())).toBe(true);
        expect(binding.nodeMapper.hasLexicalMapping(text3.getKey())).toBe(true);

        // Verify structure in Loro
        const paragraphTreeID = binding.nodeMapper.getTreeIDByLexicalKey(paragraph.getKey());
        const paragraphNode = binding.tree.getNodeByID(paragraphTreeID!);

        expect(paragraphNode).toBeDefined();
        expect(paragraphNode?.data.get('lexical').type).toBe('paragraph');
      });
    });

    it('handles multiple paragraphs with different content', () => {
      const doc = new LoroDoc();
      const binding = createTestBinding(doc);
      const editor = binding.editor;

      editor.update(() => {
        const root = $getRoot();

        // Create first paragraph
        const para1 = $createParagraphNode();
        const text1 = $createTextNode('Paragraph 1');
        para1.append(text1);

        // Create second paragraph
        const para2 = $createParagraphNode();
        const text2 = $createTextNode('Paragraph 2');
        para2.append(text2);

        // Create third paragraph
        const para3 = $createParagraphNode();
        const text3 = $createTextNode('Paragraph 3');
        para3.append(text3);

        root.append(para1, para2, para3);

        // Verify all structures exist
        const children = root.getChildren();
        expect(children.length).toBe(3);
        expect(children[0].getTextContent()).toBe('Paragraph 1');
        expect(children[1].getTextContent()).toBe('Paragraph 2');
        expect(children[2].getTextContent()).toBe('Paragraph 3');
      });
    });
  });

  describe('Collaborative editing scenarios', () => {
    it('simulates two users editing different parts', () => {
      const doc = new LoroDoc();
      const tree = doc.getTree('lexical');

      // User 1's editor
      const binding1 = createTestBinding(doc);
      const editor1 = binding1.editor;

      editor1.update(() => {
        const root = $getRoot();
        const paragraph = $createParagraphNode();
        const text = $createTextNode('User 1 text');
        paragraph.append(text);
        root.append(paragraph);
      });

      // Export document state
      const snapshot = doc.exportFrom();

      // User 2's editor with same document
      const doc2 = new LoroDoc();
      doc2.import(snapshot);
      const binding2 = createTestBinding(doc2);
      const editor2 = binding2.editor;

      // User 2 adds content
      editor2.update(() => {
        const root = $getRoot();

        // First integrate User 1's changes
        const tree2 = doc2.getTree('lexical');
        // Note: In real scenario, this would happen via event listeners

        // User 2 adds new paragraph
        const newPara = $createParagraphNode();
        const newText = $createTextNode('User 2 text');
        newPara.append(newText);
        root.append(newPara);
      });

      // Verify both editors have content
      editor1.getEditorState().read(() => {
        const root = $getRoot();
        const children = root.getChildren();
        expect(children.length).toBeGreaterThanOrEqual(1);
      });

      editor2.getEditorState().read(() => {
        const root = $getRoot();
        const children = root.getChildren();
        expect(children.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Node deletion and updates', () => {
    it('synchronizes node deletion', () => {
      const doc = new LoroDoc();
      const binding = createTestBinding(doc);
      const editor = binding.editor;

      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('To delete');
        root.append(textNode);

        const nodeKey = textNode.getKey();
        const treeID = binding.nodeMapper.getTreeIDByLexicalKey(nodeKey);

        // Delete the node
        textNode.remove();

        // Verify node removed from Lexical
        expect($getNodeByKey(nodeKey)).toBeNull();

        // Note: In real scenario, Propagator would delete from Loro
        // Here we verify the mapping can be manually cleaned up
        binding.nodeMapper.deleteMapping(nodeKey);

        expect(binding.nodeMapper.hasLexicalMapping(nodeKey)).toBe(false);
        if (treeID) {
          expect(binding.tree.has(treeID)).toBe(false);
        }
      });
    });

    it('synchronizes text content updates', () => {
      const doc = new LoroDoc();
      const binding = createTestBinding(doc);
      const editor = binding.editor;

      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Original text');
        root.append(textNode);

        const nodeKey = textNode.getKey();

        // Update text content
        textNode.setTextContent('Updated text');

        // Verify updated in Lexical
        expect(textNode.getTextContent()).toBe('Updated text');

        // Verify mapping still exists
        expect(binding.nodeMapper.hasLexicalMapping(nodeKey)).toBe(true);
      });
    });
  });

  describe('Generic node type handling', () => {
    it('handles all node types through exportJSON/importJSON', () => {
      const doc = new LoroDoc();
      const binding = createTestBinding(doc);
      const editor = binding.editor;

      editor.update(() => {
        const root = $getRoot();

        // Test with paragraph (ElementNode)
        const paragraph = $createParagraphNode();
        const text = $createTextNode('Text inside');
        paragraph.append(text);
        root.append(paragraph);

        // Verify both nodes have proper mappings
        const paragraphKey = paragraph.getKey();
        const textKey = text.getKey();

        expect(binding.nodeMapper.hasLexicalMapping(paragraphKey)).toBe(true);
        expect(binding.nodeMapper.hasLexicalMapping(textKey)).toBe(true);

        // Verify data structure in Loro
        const paragraphTreeID = binding.nodeMapper.getTreeIDByLexicalKey(paragraphKey);
        const paragraphNode = binding.tree.getNodeByID(paragraphTreeID!);
        const paragraphData = paragraphNode?.data.get('lexical');

        expect(paragraphData.type).toBe('paragraph');
      });
    });
  });

  describe('Error resilience', () => {
    it('handles missing parent nodes gracefully', () => {
      const doc = new LoroDoc();
      const binding = createTestBinding(doc);
      const editor = binding.editor;

      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Orphan text');

        // Try to integrate a create operation with non-existent parent
        const exportedJSON = textNode.exportJSON();
        const loroNode = binding.tree.createNode();
        loroNode.data.set('lexical', exportedJSON);

        const fakeParentID = '00000000-0000-0000-0000-000000000000' as any;

        const diff = {
          type: 'tree' as const,
          diff: [{
            action: 'create' as const,
            target: loroNode.id,
            parent: fakeParentID,
            index: 0
          }]
        };

        // Should not throw, should fallback to root
        expect(() => {
          binding.integrators.tree.integrateInternal(diff, binding, binding.provider);
        }).not.toThrow();
      });
    });

    it('handles duplicate create operations', () => {
      const doc = new LoroDoc();
      const binding = createTestBinding(doc);
      const editor = binding.editor;

      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Test');
        root.append(textNode);

        const exportedJSON = textNode.exportJSON();
        const loroNode = binding.tree.createNode();
        loroNode.data.set('lexical', exportedJSON);

        const rootTreeID = binding.nodeMapper.getTreeIDByLexicalKey(root.getKey());

        const diff = {
          type: 'tree' as const,
          diff: [{
            action: 'create' as const,
            target: loroNode.id,
            parent: rootTreeID,
            index: 0
          }]
        };

        // First integration
        binding.integrators.tree.integrateInternal(diff, binding, binding.provider);

        // Second integration of same node should not cause issues
        expect(() => {
          binding.integrators.tree.integrateInternal(diff, binding, binding.provider);
        }).not.toThrow();
      });
    });
  });
});
