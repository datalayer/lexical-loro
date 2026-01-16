/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { TreeIntegrator } from '../integrators/TreeIntegrator';
import {
  $createTextNode,
  $createParagraphNode,
  $getRoot,
  $getNodeByKey,
  createEditor,
  LexicalEditor
} from 'lexical';
import { LoroDoc, LoroTree, TreeID } from 'loro-crdt';
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

describe('TreeIntegrator', () => {
  let editor: LexicalEditor;
  let doc: LoroDoc;
  let tree: LoroTree;
  let binding: Binding;
  let integrator: TreeIntegrator;

  beforeEach(() => {
    doc = new LoroDoc();
    tree = doc.getTree('lexical');
    binding = createTestBinding(doc);
    editor = binding.editor;
    integrator = new TreeIntegrator();
  });

  describe('Create operations', () => {
    it('integrates create operation for text node', () => {
      editor.update(() => {
        const root = $getRoot();

        // Create a text node and export it
        const textNode = $createTextNode('Test text');
        root.append(textNode);
        const exportedJSON = textNode.exportJSON();

        // Clear the editor
        root.clear();

        // Create Loro tree node
        const treeNode = tree.createNode();
        treeNode.data.set('lexical', exportedJSON);

        // Create tree diff
        const diff = {
          type: 'tree' as const,
          diff: [{
            action: 'create' as const,
            target: treeNode.id,
            parent: binding.nodeMapper.getTreeIDByLexicalKey(root.getKey()),
            index: 0
          }]
        };

        // Integrate the operation
        integrator.integrateInternal(diff, binding, binding.provider);

        // Verify node was created
        const children = root.getChildren();
        expect(children.length).toBe(1);
        expect(children[0].getType()).toBe('text');
        expect(children[0].getTextContent()).toBe('Test text');
      });
    });

    it('integrates create operation for paragraph node', () => {
      editor.update(() => {
        const root = $getRoot();

        // Create paragraph and export
        const paragraph = $createParagraphNode();
        root.append(paragraph);
        const exportedJSON = paragraph.exportJSON();

        // Clear editor
        root.clear();

        // Create Loro tree node
        const treeNode = tree.createNode();
        treeNode.data.set('lexical', exportedJSON);

        // Create diff
        const diff = {
          type: 'tree' as const,
          diff: [{
            action: 'create' as const,
            target: treeNode.id,
            parent: binding.nodeMapper.getTreeIDByLexicalKey(root.getKey()),
            index: 0
          }]
        };

        integrator.integrateInternal(diff, binding, binding.provider);

        // Verify
        const children = root.getChildren();
        expect(children.length).toBe(1);
        expect(children[0].getType()).toBe('paragraph');
      });
    });

    it('handles create operations with correct insertion index', () => {
      editor.update(() => {
        const root = $getRoot();

        // Create three text nodes
        const text1 = $createTextNode('First');
        const text2 = $createTextNode('Second');
        const text3 = $createTextNode('Third');

        root.append(text1, text2, text3);

        const json1 = text1.exportJSON();
        const json2 = text2.exportJSON();
        const json3 = text3.exportJSON();

        // Clear and recreate via integrator
        root.clear();

        const node1 = tree.createNode();
        node1.data.set('lexical', json1);

        const node2 = tree.createNode();
        node2.data.set('lexical', json2);

        const node3 = tree.createNode();
        node3.data.set('lexical', json3);

        const rootTreeID = binding.nodeMapper.getTreeIDByLexicalKey(root.getKey());

        // Create in order
        const diff = {
          type: 'tree' as const,
          diff: [
            { action: 'create' as const, target: node1.id, parent: rootTreeID, index: 0 },
            { action: 'create' as const, target: node2.id, parent: rootTreeID, index: 1 },
            { action: 'create' as const, target: node3.id, parent: rootTreeID, index: 2 }
          ]
        };

        integrator.integrateInternal(diff, binding, binding.provider);

        // Verify order
        const children = root.getChildren();
        expect(children.length).toBe(3);
        expect(children[0].getTextContent()).toBe('First');
        expect(children[1].getTextContent()).toBe('Second');
        expect(children[2].getTextContent()).toBe('Third');
      });
    });
  });

  describe('Move operations', () => {
    it('integrates move operation for nodes', () => {
      editor.update(() => {
        const root = $getRoot();

        // Create paragraph with two text nodes
        const paragraph = $createParagraphNode();
        const text1 = $createTextNode('Text 1');
        const text2 = $createTextNode('Text 2');

        paragraph.append(text1, text2);
        root.append(paragraph);

        // Get the text1 key and TreeID
        const text1Key = text1.getKey();
        const text1TreeID = binding.nodeMapper.getTreeIDByLexicalKey(text1Key);
        const paragraphTreeID = binding.nodeMapper.getTreeIDByLexicalKey(paragraph.getKey());

        expect(text1TreeID).toBeDefined();

        // Create move diff - move text1 to index 1 (after text2)
        const diff = {
          type: 'tree' as const,
          diff: [{
            action: 'move' as const,
            target: text1TreeID!,
            parent: paragraphTreeID,
            index: 1
          }]
        };

        integrator.integrateInternal(diff, binding, binding.provider);

        // Verify text1 moved to the end
        const children = paragraph.getChildren();
        expect(children.length).toBe(2);
        expect(children[0].getTextContent()).toBe('Text 2');
        expect(children[1].getTextContent()).toBe('Text 1');
      });
    });
  });

  describe('Delete operations', () => {
    it('integrates delete operation for nodes', () => {
      editor.update(() => {
        const root = $getRoot();

        // Create text node
        const textNode = $createTextNode('To delete');
        root.append(textNode);

        const textNodeKey = textNode.getKey();
        const textNodeTreeID = binding.nodeMapper.getTreeIDByLexicalKey(textNodeKey);

        expect(textNodeTreeID).toBeDefined();
        expect(root.getChildren().length).toBe(1);

        // Create delete diff
        const diff = {
          type: 'tree' as const,
          diff: [{
            action: 'delete' as const,
            target: textNodeTreeID!
          }]
        };

        integrator.integrateInternal(diff, binding, binding.provider);

        // Verify node was deleted
        expect(root.getChildren().length).toBe(0);
        expect($getNodeByKey(textNodeKey)).toBeNull();
      });
    });

    it('handles delete operations for multiple nodes', () => {
      editor.update(() => {
        const root = $getRoot();

        // Create three nodes
        const text1 = $createTextNode('Text 1');
        const text2 = $createTextNode('Text 2');
        const text3 = $createTextNode('Text 3');

        root.append(text1, text2, text3);

        const text1TreeID = binding.nodeMapper.getTreeIDByLexicalKey(text1.getKey());
        const text3TreeID = binding.nodeMapper.getTreeIDByLexicalKey(text3.getKey());

        // Delete text1 and text3
        const diff = {
          type: 'tree' as const,
          diff: [
            { action: 'delete' as const, target: text1TreeID! },
            { action: 'delete' as const, target: text3TreeID! }
          ]
        };

        integrator.integrateInternal(diff, binding, binding.provider);

        // Verify only text2 remains
        const children = root.getChildren();
        expect(children.length).toBe(1);
        expect(children[0].getTextContent()).toBe('Text 2');
      });
    });
  });

  describe('Operation ordering', () => {
    it('processes deletes before creates', () => {
      editor.update(() => {
        const root = $getRoot();

        // Create initial node
        const oldText = $createTextNode('Old');
        root.append(oldText);
        const oldTreeID = binding.nodeMapper.getTreeIDByLexicalKey(oldText.getKey());

        // Create new node in Loro
        const newNode = tree.createNode();
        const newText = $createTextNode('New');
        root.append(newText);
        newNode.data.set('lexical', newText.exportJSON());
        root.clear();
        root.append(oldText);

        // Create diff with create before delete (should be reordered)
        const diff = {
          type: 'tree' as const,
          diff: [
            {
              action: 'create' as const,
              target: newNode.id,
              parent: binding.nodeMapper.getTreeIDByLexicalKey(root.getKey()),
              index: 0
            },
            { action: 'delete' as const, target: oldTreeID! }
          ]
        };

        integrator.integrateInternal(diff, binding, binding.provider);

        // Should have only the new node
        const children = root.getChildren();
        expect(children.length).toBe(1);
        expect(children[0].getTextContent()).toBe('New');
      });
    });
  });

  describe('Error handling', () => {
    it('handles missing parent gracefully', () => {
      const fakeTreeID = '00000000-0000-0000-0000-000000000000' as TreeID;

      const diff = {
        type: 'tree' as const,
        diff: [{
          action: 'create' as const,
          target: fakeTreeID,
          parent: fakeTreeID,
          index: 0
        }]
      };

      // Should not throw
      expect(() => {
        integrator.integrate(diff, binding, binding.provider);
      }).not.toThrow();
    });

    it('handles delete of non-existent node gracefully', () => {
      const fakeTreeID = '00000000-0000-0000-0000-000000000000' as TreeID;

      const diff = {
        type: 'tree' as const,
        diff: [{
          action: 'delete' as const,
          target: fakeTreeID
        }]
      };

      // Should not throw
      expect(() => {
        integrator.integrate(diff, binding, binding.provider);
      }).not.toThrow();
    });
  });
});
