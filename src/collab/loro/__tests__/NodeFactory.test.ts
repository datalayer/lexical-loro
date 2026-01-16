import { createLexicalNodeFromLoro } from '../nodes/NodeFactory';
import {
  $createTextNode,
  $createParagraphNode,
  $getRoot,
  createEditor,
  LexicalEditor,
  TextNode,
  ParagraphNode
} from 'lexical';
import { LoroDoc, LoroTree, TreeID } from 'loro-crdt';
import { Binding } from '../Bindings';
import { Provider } from '../Provider';

// Mock Provider class for testing
class MockProvider extends Provider {
  constructor(doc: LoroDoc, awareness: any) {
    super(doc, awareness);
  }
}

/**
 * Creates a test binding with a properly configured editor
 */
function createTestBinding(doc: LoroDoc): Binding {
  const editor = createEditor({
    nodes: [TextNode, ParagraphNode],
    onError: (error) => {
      console.error('Editor error:', error);
    }
  });

  const awareness = { clientID: 1 };
  const provider = new MockProvider(doc, awareness);

  const binding = new Binding(
    $getRoot().getKey(),
    provider,
    doc.getTree('lexical'),
    editor,
    () => $getRoot()
  );

  return binding;
}

describe('NodeFactory', () => {
  let editor: LexicalEditor;
  let doc: LoroDoc;
  let tree: LoroTree;
  let binding: Binding;

  beforeEach(() => {
    // Create a new Loro document and tree
    doc = new LoroDoc();
    tree = doc.getTree('lexical');

    // Create binding with editor
    binding = createTestBinding(doc);
    editor = binding.editor;
  });

  afterEach(() => {
    if (editor) {
      // Clean up editor
    }
  });

  describe('TextNode creation', () => {
    it('creates TextNode from Loro tree data', () => {
      editor.update(() => {
        const root = $getRoot();

        // Create a text node in Lexical to get proper JSON format
        const textNode = $createTextNode('Hello World');
        textNode.setFormat(1); // Bold
        root.append(textNode);

        const exportedJSON = textNode.exportJSON();

        // Create corresponding Loro tree node
        const treeNode = tree.createNode();
        treeNode.data.set('lexical', exportedJSON);

        // Test factory function
        const recreatedNode = createLexicalNodeFromLoro(
          treeNode.id,
          tree,
          binding
        );

        expect(recreatedNode).not.toBeNull();
        expect(recreatedNode?.getType()).toBe('text');
        expect(recreatedNode?.getTextContent()).toBe('Hello World');

        // Check if it's a TextNode and verify format
        if (recreatedNode && recreatedNode.getType() === 'text') {
          const textNodeRecreated = recreatedNode as TextNode;
          expect(textNodeRecreated.getFormat()).toBe(1);
        }
      });
    });

    it('handles text nodes with different formats', () => {
      editor.update(() => {
        const formats = [
          { format: 0, name: 'normal' },
          { format: 1, name: 'bold' },
          { format: 2, name: 'italic' },
          { format: 3, name: 'bold+italic' }
        ];

        formats.forEach(({ format, name }) => {
          const textNode = $createTextNode(`Text ${name}`);
          textNode.setFormat(format);
          $getRoot().append(textNode);

          const exportedJSON = textNode.exportJSON();
          const treeNode = tree.createNode();
          treeNode.data.set('lexical', exportedJSON);

          const recreatedNode = createLexicalNodeFromLoro(
            treeNode.id,
            tree,
            binding
          );

          expect(recreatedNode?.getType()).toBe('text');
          if (recreatedNode && recreatedNode.getType() === 'text') {
            const textNodeRecreated = recreatedNode as TextNode;
            expect(textNodeRecreated.getFormat()).toBe(format);
            expect(textNodeRecreated.getTextContent()).toBe(`Text ${name}`);
          }
        });
      });
    });
  });

  describe('ParagraphNode creation', () => {
    it('creates ParagraphNode from Loro tree data', () => {
      editor.update(() => {
        const paragraphNode = $createParagraphNode();
        $getRoot().append(paragraphNode);

        const exportedJSON = paragraphNode.exportJSON();

        const treeNode = tree.createNode();
        treeNode.data.set('lexical', exportedJSON);

        const recreatedNode = createLexicalNodeFromLoro(
          treeNode.id,
          tree,
          binding
        );

        expect(recreatedNode).not.toBeNull();
        expect(recreatedNode?.getType()).toBe('paragraph');
      });
    });
  });

  describe('Error handling', () => {
    it('returns null for non-existent tree nodes', () => {
      const fakeTreeId = '00000000-0000-0000-0000-000000000000' as TreeID;

      const result = createLexicalNodeFromLoro(
        fakeTreeId,
        tree,
        binding
      );

      expect(result).toBeNull();
    });

    it('returns null for nodes with missing lexical data', () => {
      const treeNode = tree.createNode();
      // Don't set any lexical data

      const result = createLexicalNodeFromLoro(
        treeNode.id,
        tree,
        binding
      );

      expect(result).toBeNull();
    });

    it('returns null for unregistered node types', () => {
      const treeNode = tree.createNode();
      treeNode.data.set('lexical', {
        type: 'unregistered-custom-node',
        version: 1
      });

      const result = createLexicalNodeFromLoro(
        treeNode.id,
        tree,
        binding
      );

      expect(result).toBeNull();
    });
  });

  describe('Node data from diff', () => {
    it('uses nodeDataFromDiff when provided', () => {
      editor.update(() => {
        const textNode = $createTextNode('From diff');
        $getRoot().append(textNode);

        const exportedJSON = textNode.exportJSON();

        const treeNode = tree.createNode();
        // Intentionally set different data in tree
        treeNode.data.set('lexical', { type: 'text', text: 'Old text' });

        // Provide fresh data from diff
        const nodeDataFromDiff = {
          lexical: exportedJSON
        };

        const recreatedNode = createLexicalNodeFromLoro(
          treeNode.id,
          tree,
          binding,
          undefined,
          nodeDataFromDiff
        );

        expect(recreatedNode).not.toBeNull();
        expect(recreatedNode?.getTextContent()).toBe('From diff');
      });
    });
  });

  describe('Generic node handling', () => {
    it('handles any node type with exportJSON/importJSON', () => {
      editor.update(() => {
        const paragraph = $createParagraphNode();
        const text1 = $createTextNode('First ');
        const text2 = $createTextNode('Second');

        paragraph.append(text1, text2);
        $getRoot().append(paragraph);

        // Export paragraph and recreate
        const paragraphJSON = paragraph.exportJSON();
        const paragraphTreeNode = tree.createNode();
        paragraphTreeNode.data.set('lexical', paragraphJSON);

        const recreatedParagraph = createLexicalNodeFromLoro(
          paragraphTreeNode.id,
          tree,
          binding
        );

        expect(recreatedParagraph).not.toBeNull();
        expect(recreatedParagraph?.getType()).toBe('paragraph');
      });
    });
  });
});
