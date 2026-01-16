/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { NodeMapper } from '../nodes/NodesMapper';
import {
  $createTextNode,
  $createParagraphNode,
  $getRoot,
  createEditor,
  LexicalEditor
} from 'lexical';
import { LoroDoc, LoroTree } from 'loro-crdt';
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

describe('NodeMapper', () => {
  let editor: LexicalEditor;
  let doc: LoroDoc;
  let tree: LoroTree;
  let binding: Binding;
  let mapper: NodeMapper;

  beforeEach(() => {
    doc = new LoroDoc();
    tree = doc.getTree('lexical');
    binding = createTestBinding(doc);
    editor = binding.editor;
    mapper = binding.nodeMapper;
  });

  describe('Basic mapping operations', () => {
    it('creates bidirectional mapping', () => {
      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Test');
        root.append(textNode);

        const nodeKey = textNode.getKey();

        // Get or create Loro node
        const loroNode = mapper.getLoroNodeByLexicalKey(
          nodeKey,
          textNode,
          mapper.getTreeIDByLexicalKey(root.getKey())
        );

        // Verify bidirectional mapping
        const retrievedTreeID = mapper.getTreeIDByLexicalKey(nodeKey);
        expect(retrievedTreeID).toBe(loroNode.id);

        const retrievedNodeKey = mapper.getLexicalKeyByLoroId(loroNode.id);
        expect(retrievedNodeKey).toBe(nodeKey);
      });
    });

    it('manually sets mapping', () => {
      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Test');
        root.append(textNode);

        const nodeKey = textNode.getKey();
        const treeNode = tree.createNode();

        // Manually set mapping
        mapper.setMapping(nodeKey, treeNode.id);

        // Verify mapping
        expect(mapper.getTreeIDByLexicalKey(nodeKey)).toBe(treeNode.id);
        expect(mapper.getLexicalKeyByLoroId(treeNode.id)).toBe(nodeKey);
      });
    });

    it('checks mapping existence', () => {
      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Test');
        root.append(textNode);

        const nodeKey = textNode.getKey();

        // Initially no mapping
        expect(mapper.hasLexicalMapping(nodeKey)).toBe(false);

        // Create mapping
        const loroNode = mapper.getLoroNodeByLexicalKey(
          nodeKey,
          textNode,
          mapper.getTreeIDByLexicalKey(root.getKey())
        );

        // Now mapping exists
        expect(mapper.hasLexicalMapping(nodeKey)).toBe(true);
        expect(mapper.hasLoroMapping(loroNode.id)).toBe(true);
      });
    });
  });

  describe('Node creation', () => {
    it('creates Loro node with proper data', () => {
      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Hello World');
        textNode.setFormat(1); // Bold
        root.append(textNode);

        const nodeKey = textNode.getKey();
        const loroNode = mapper.getLoroNodeByLexicalKey(
          nodeKey,
          textNode,
          mapper.getTreeIDByLexicalKey(root.getKey())
        );

        // Check Loro node has lexical data
        const lexicalData = loroNode.data.get('lexical');
        expect(lexicalData).toBeDefined();
        expect(lexicalData.type).toBe('text');
        expect(lexicalData.text).toBe('Hello World');
        expect(lexicalData.format).toBe(1);
      });
    });

    it('creates Loro node with parent relationship', () => {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = $createParagraphNode();
        const textNode = $createTextNode('Child text');

        paragraph.append(textNode);
        root.append(paragraph);

        // Create mapping for paragraph first
        const paragraphKey = paragraph.getKey();
        const paragraphLoroNode = mapper.getLoroNodeByLexicalKey(
          paragraphKey,
          paragraph,
          mapper.getTreeIDByLexicalKey(root.getKey())
        );

        // Create mapping for text node with parent
        const textKey = textNode.getKey();
        const textLoroNode = mapper.getLoroNodeByLexicalKey(
          textKey,
          textNode,
          paragraphLoroNode.id
        );

        // Verify parent relationship
        const parent = textLoroNode.parent();
        expect(parent?.id).toBe(paragraphLoroNode.id);
      });
    });
  });

  describe('Mapping updates', () => {
    it('updates mapping when node key changes', () => {
      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Test');
        root.append(textNode);

        const oldKey = textNode.getKey();
        const loroNode = mapper.getLoroNodeByLexicalKey(
          oldKey,
          textNode,
          mapper.getTreeIDByLexicalKey(root.getKey())
        );

        const treeID = loroNode.id;
        const newKey = 'new-key-123';

        // Update mapping
        mapper.updateMapping(oldKey, newKey);

        // Verify old mapping removed
        expect(mapper.hasLexicalMapping(oldKey)).toBe(false);

        // Verify new mapping created
        expect(mapper.getTreeIDByLexicalKey(newKey)).toBe(treeID);
        expect(mapper.getLexicalKeyByLoroId(treeID)).toBe(newKey);
      });
    });

    it('deletes mapping and Loro node', () => {
      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Test');
        root.append(textNode);

        const nodeKey = textNode.getKey();
        const loroNode = mapper.getLoroNodeByLexicalKey(
          nodeKey,
          textNode,
          mapper.getTreeIDByLexicalKey(root.getKey())
        );

        const treeID = loroNode.id;

        // Verify mapping and node exist
        expect(mapper.hasLexicalMapping(nodeKey)).toBe(true);
        expect(tree.has(treeID)).toBe(true);

        // Delete mapping
        mapper.deleteMapping(nodeKey);

        // Verify mapping removed
        expect(mapper.hasLexicalMapping(nodeKey)).toBe(false);
        expect(mapper.hasLoroMapping(treeID)).toBe(false);

        // Verify Loro node deleted
        expect(tree.has(treeID)).toBe(false);
      });
    });
  });

  describe('Mapping retrieval', () => {
    it('returns null for non-existent Lexical key', () => {
      const result = mapper.getTreeIDByLexicalKey('non-existent-key');
      expect(result).toBeUndefined();
    });

    it('returns null for non-existent Loro TreeID', () => {
      const fakeTreeID = '00000000-0000-0000-0000-000000000000' as any;
      const result = mapper.getLexicalKeyByLoroId(fakeTreeID);
      expect(result).toBeNull();
    });

    it('gets all mappings', () => {
      editor.update(() => {
        const root = $getRoot();
        const text1 = $createTextNode('Text 1');
        const text2 = $createTextNode('Text 2');

        root.append(text1, text2);

        // Create mappings
        mapper.getLoroNodeByLexicalKey(
          text1.getKey(),
          text1,
          mapper.getTreeIDByLexicalKey(root.getKey())
        );
        mapper.getLoroNodeByLexicalKey(
          text2.getKey(),
          text2,
          mapper.getTreeIDByLexicalKey(root.getKey())
        );

        // Get all mappings
        const mappings = mapper.getAllMappings();

        // Should have at least 2 mappings (excluding root)
        expect(mappings.lexicalToLoro.size).toBeGreaterThanOrEqual(2);
        expect(mappings.loroToLexical.size).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Clear operations', () => {
    it('clears all mappings', () => {
      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Test');
        root.append(textNode);

        // Create mapping
        mapper.getLoroNodeByLexicalKey(
          textNode.getKey(),
          textNode,
          mapper.getTreeIDByLexicalKey(root.getKey())
        );

        // Verify mapping exists
        expect(mapper.hasLexicalMapping(textNode.getKey())).toBe(true);

        // Clear all mappings
        mapper.clearMappings();

        // Verify all mappings cleared
        expect(mapper.hasLexicalMapping(textNode.getKey())).toBe(false);

        const allMappings = mapper.getAllMappings();
        expect(allMappings.lexicalToLoro.size).toBe(0);
        expect(allMappings.loroToLexical.size).toBe(0);
      });
    });
  });

  describe('Edge cases', () => {
    it('handles reusing existing Loro node', () => {
      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Test');
        root.append(textNode);

        const nodeKey = textNode.getKey();

        // First call creates the Loro node
        const loroNode1 = mapper.getLoroNodeByLexicalKey(
          nodeKey,
          textNode,
          mapper.getTreeIDByLexicalKey(root.getKey())
        );

        // Second call should return the same Loro node
        const loroNode2 = mapper.getLoroNodeByLexicalKey(nodeKey, textNode);

        expect(loroNode1.id).toBe(loroNode2.id);
      });
    });

    it('handles nodes without Lexical data gracefully', () => {
      editor.update(() => {
        const root = $getRoot();
        const textNode = $createTextNode('Test');
        root.append(textNode);

        const nodeKey = textNode.getKey();

        // Create Loro node without providing Lexical node
        const loroNode = mapper.getLoroNodeByLexicalKey(
          nodeKey,
          undefined,
          mapper.getTreeIDByLexicalKey(root.getKey())
        );

        // Should still create node and mapping
        expect(loroNode).toBeDefined();
        expect(mapper.hasLexicalMapping(nodeKey)).toBe(true);
      });
    });
  });
});
