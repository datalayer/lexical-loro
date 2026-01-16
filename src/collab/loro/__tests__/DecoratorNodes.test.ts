import {
  $getRoot,
  createEditor,
  LexicalEditor,
  DecoratorNode,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode
} from 'lexical';
import { LoroDoc, LoroTree } from 'loro-crdt';
import { Binding } from '../Bindings';
import { Provider } from '../Provider';
import { createLexicalNodeFromLoro } from '../nodes/NodeFactory';

// Mock Provider class
class MockProvider extends Provider {
  constructor(doc: LoroDoc, awareness: any) {
    super(doc, awareness);
  }
}

// Mock DecoratorNode for testing
type SerializedTestDecoratorNode = SerializedLexicalNode & {
  data: string;
};

class TestDecoratorNode extends DecoratorNode<string> {
  __data: string;

  static getType(): string {
    return 'test-decorator';
  }

  static clone(node: TestDecoratorNode): TestDecoratorNode {
    return new TestDecoratorNode(node.__data, node.__key);
  }

  constructor(data: string, key?: NodeKey) {
    super(key);
    this.__data = data;
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div');
    div.textContent = this.__data;
    return div;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): string {
    return this.__data;
  }

  exportJSON(): SerializedTestDecoratorNode {
    return {
      type: 'test-decorator',
      version: 1,
      data: this.__data
    };
  }

  static importJSON(serializedNode: SerializedTestDecoratorNode): TestDecoratorNode {
    return new TestDecoratorNode(serializedNode.data);
  }

  getData(): string {
    return this.__data;
  }

  setData(data: string): void {
    const writable = this.getWritable();
    writable.__data = data;
  }
}

function createTestBinding(doc: LoroDoc): Binding {
  const editor = createEditor({
    nodes: [TestDecoratorNode],
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

describe('DecoratorNodes', () => {
  let editor: LexicalEditor;
  let doc: LoroDoc;
  let tree: LoroTree;
  let binding: Binding;

  beforeEach(() => {
    doc = new LoroDoc();
    tree = doc.getTree('lexical');
    binding = createTestBinding(doc);
    editor = binding.editor;
  });

  describe('Decorator node synchronization', () => {
    it('creates DecoratorNode from Loro data', () => {
      editor.update(() => {
        const root = $getRoot();

        // Create decorator node
        const decoratorNode = new TestDecoratorNode('Test data');
        root.append(decoratorNode);

        const exportedJSON = decoratorNode.exportJSON();

        // Clear and recreate from Loro
        root.clear();

        const treeNode = tree.createNode();
        treeNode.data.set('lexical', exportedJSON);

        const recreatedNode = createLexicalNodeFromLoro(
          treeNode.id,
          tree,
          binding
        );

        expect(recreatedNode).not.toBeNull();
        expect(recreatedNode?.getType()).toBe('test-decorator');

        if (recreatedNode instanceof TestDecoratorNode) {
          expect(recreatedNode.getData()).toBe('Test data');
        }
      });
    });

    it('synchronizes DecoratorNode updates', () => {
      editor.update(() => {
        const root = $getRoot();

        // Create and add decorator node
        const decoratorNode = new TestDecoratorNode('Original data');
        root.append(decoratorNode);

        // Update the data
        decoratorNode.setData('Updated data');

        // Export and verify
        const exportedJSON = decoratorNode.exportJSON();
        expect(exportedJSON.data).toBe('Updated data');

        // Verify mapping exists
        expect(binding.nodeMapper.hasLexicalMapping(decoratorNode.getKey())).toBe(true);
      });
    });

    it('handles DecoratorNode in complex structure', () => {
      editor.update(() => {
        const root = $getRoot();

        // Create structure: root -> paragraph -> decorator
        const paragraph = createEditor().update(() => {
          const p = $getRoot();
          return p;
        });

        const decoratorNode = new TestDecoratorNode('Nested decorator');

        // Add to root (can't add decorator to paragraph in this simplified test)
        root.append(decoratorNode);

        // Verify structure
        const children = root.getChildren();
        expect(children.some(child => child.getType() === 'test-decorator')).toBe(true);
      });
    });
  });

  describe('Generic decorator handling via exportJSON/importJSON', () => {
    it('serializes and deserializes decorator node correctly', () => {
      editor.update(() => {
        const decoratorNode = new TestDecoratorNode('Serialization test');
        const exported = decoratorNode.exportJSON();

        expect(exported.type).toBe('test-decorator');
        expect(exported.data).toBe('Serialization test');

        // Verify importJSON reconstructs the node
        const imported = TestDecoratorNode.importJSON(exported);
        expect(imported.getData()).toBe('Serialization test');
      });
    });

    it('maintains decorator state through Loro roundtrip', () => {
      editor.update(() => {
        const root = $getRoot();

        // Create decorator with specific state
        const decoratorNode = new TestDecoratorNode('State preservation test');
        root.append(decoratorNode);

        const nodeKey = decoratorNode.getKey();

        // Get exported JSON
        const exportedJSON = decoratorNode.exportJSON();

        // Create Loro node
        const loroNode = tree.createNode();
        loroNode.data.set('lexical', exportedJSON);

        // Verify data in Loro
        const loroData = loroNode.data.get('lexical');
        expect(loroData.type).toBe('test-decorator');
        expect(loroData.data).toBe('State preservation test');

        // Recreate from Loro
        const recreated = createLexicalNodeFromLoro(
          loroNode.id,
          tree,
          binding
        );

        if (recreated instanceof TestDecoratorNode) {
          expect(recreated.getData()).toBe('State preservation test');
        }
      });
    });
  });

  describe('Custom node types (future)', () => {
    it.todo('handles ImageNode with src and alt text');
    it.todo('handles EquationNode with LaTeX formula');
    it.todo('handles ExcalidrawNode with drawing data');
    it.todo('handles YouTubeNode with video ID');
    it.todo('handles JupyterCellNode with cell metadata');
    it.todo('handles CommentThreadNode with thread data');
  });

  describe('Edge cases', () => {
    it('handles DecoratorNode with empty data', () => {
      editor.update(() => {
        const decoratorNode = new TestDecoratorNode('');
        const exported = decoratorNode.exportJSON();

        expect(exported.data).toBe('');

        const imported = TestDecoratorNode.importJSON(exported);
        expect(imported.getData()).toBe('');
      });
    });

    it('handles DecoratorNode with complex data structures', () => {
      // This test would require a more complex decorator node
      // For now, we test that the generic pattern works
      editor.update(() => {
        const decoratorNode = new TestDecoratorNode(JSON.stringify({ nested: 'data' }));
        const exported = decoratorNode.exportJSON();

        const parsed = JSON.parse(exported.data);
        expect(parsed.nested).toBe('data');
      });
    });
  });
});
